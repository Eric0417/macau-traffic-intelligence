import "server-only";
import Redis from "ioredis";
import { CACHE_PREFIX } from "@/lib/config";
import type { SourceDefinition, SourceData } from "@/server/source";
import { sourceAttribution } from "@/server/source";

interface CacheEntry<T> {
  data: T;
  updatedAt: string;
}

interface CacheBackend {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: CacheEntry<T>, ttlSeconds: number): Promise<void>;
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  recordFailure(key: string): Promise<number>;
  clearFailure(key: string): Promise<void>;
  failureCount(key: string): Promise<number>;
  type(): "redis" | "memory";
}

class MemoryBackend implements CacheBackend {
  private values = new Map<string, { value: unknown; expiresAt: number }>();
  private locks = new Set<string>();
  private counters = new Map<string, { value: number; expiresAt: number }>();

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value as CacheEntry<T>;
  }

  async set<T>(key: string, value: CacheEntry<T>, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }

  async acquireLock(key: string, _ttlSeconds?: number): Promise<boolean> {
    void _ttlSeconds;
    if (this.locks.has(key)) return false;
    this.locks.add(key);
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    this.locks.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1_000 });
      return 1;
    }
    current.value += 1;
    return current.value;
  }

  async recordFailure(key: string): Promise<number> {
    return this.increment(key, 300);
  }

  async clearFailure(key: string): Promise<void> {
    this.counters.delete(key);
  }

  async failureCount(key: string): Promise<number> {
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= Date.now()) return 0;
    return current.value;
  }

  type(): "memory" {
    return "memory";
  }
}

class RedisBackend implements CacheBackend {
  private readonly memory = new MemoryBackend();

  constructor(private readonly redis: Redis) {}

  private async run<T>(redisOperation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await redisOperation();
    } catch {
      return fallback();
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.run(async () => {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as CacheEntry<T>) : null;
    }, () => this.memory.get<T>(key));
  }

  async set<T>(key: string, value: CacheEntry<T>, ttlSeconds: number): Promise<void> {
    await this.run(async () => {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    }, () => this.memory.set(key, value, ttlSeconds));
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    return this.run(async () => {
      const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    }, () => this.memory.acquireLock(key, ttlSeconds));
  }

  async releaseLock(key: string): Promise<void> {
    await this.run(async () => {
      await this.redis.del(key);
    }, () => this.memory.releaseLock(key));
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    return this.run(async () => {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, ttlSeconds);
      return count;
    }, () => this.memory.increment(key, ttlSeconds));
  }

  async recordFailure(key: string): Promise<number> {
    return this.increment(key, 300);
  }

  async clearFailure(key: string): Promise<void> {
    await this.run(async () => {
      await this.redis.del(key);
    }, () => this.memory.clearFailure(key));
  }

  async failureCount(key: string): Promise<number> {
    return this.run(async () => Number((await this.redis.get(key)) ?? 0), () =>
      this.memory.failureCount(key),
    );
  }

  type(): "redis" {
    return "redis";
  }
}

declare global {
  var __macauTrafficCacheBackend: CacheBackend | undefined;
}

function createRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;

  if (!globalThis.__macauTrafficCacheBackend) {
    const redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
    });
    redis.on("error", () => {});
    void redis.connect().catch(() => {});
    globalThis.__macauTrafficCacheBackend = new RedisBackend(redis);
  }

  return null;
}

export function getCacheBackend(): CacheBackend {
  if (!globalThis.__macauTrafficCacheBackend) {
    createRedisClient();
    globalThis.__macauTrafficCacheBackend ??= new MemoryBackend();
  }
  return globalThis.__macauTrafficCacheBackend;
}

async function refreshSource<T>(source: SourceDefinition<T>, backend: CacheBackend): Promise<void> {
  const lockKey = `${CACHE_PREFIX}:lock:${source.id}`;
  const acquired = await backend.acquireLock(lockKey, 15);
  if (!acquired) return;

  try {
    const data = source.schema.parse(await source.load());
    await backend.set(
      `${CACHE_PREFIX}:source:${source.id}`,
      { data, updatedAt: new Date().toISOString() },
      source.staleTtlSeconds,
    );
    await backend.clearFailure(`${CACHE_PREFIX}:failure:${source.id}`);
  } catch {
    await backend.recordFailure(`${CACHE_PREFIX}:failure:${source.id}`);
  } finally {
    await backend.releaseLock(lockKey);
  }
}

export interface SourceRead<T> {
  result: SourceData<T>;
  refresh?: () => Promise<void>;
}

export async function readSource<T>(source: SourceDefinition<T>): Promise<SourceRead<T> | null> {
  const backend = getCacheBackend();
  const key = `${CACHE_PREFIX}:source:${source.id}`;
  const cached = await backend.get<T>(key);
  const now = Date.now();

  if (cached) {
    const ageSeconds = Math.max(0, (now - Date.parse(cached.updatedAt)) / 1_000);
    if (ageSeconds <= source.ttlSeconds) {
      return {
        result: {
          data: cached.data,
          attribution: sourceAttribution(source),
          updatedAt: cached.updatedAt,
          stale: false,
          ttlSeconds: source.ttlSeconds,
        },
      };
    }

    if (ageSeconds <= source.staleTtlSeconds) {
      const failures = await backend.failureCount(`${CACHE_PREFIX}:failure:${source.id}`);
      return {
        result: {
          data: cached.data,
          attribution: sourceAttribution(source),
          updatedAt: cached.updatedAt,
          stale: true,
          ttlSeconds: source.ttlSeconds,
        },
        refresh: failures >= 5 ? undefined : () => refreshSource(source, backend),
      };
    }
  }

  const failures = await backend.failureCount(`${CACHE_PREFIX}:failure:${source.id}`);
  if (failures >= 5) {
    return cached
      ? {
          result: {
            data: cached.data,
            attribution: sourceAttribution(source),
            updatedAt: cached.updatedAt,
            stale: true,
            ttlSeconds: source.ttlSeconds,
          },
        }
      : null;
  }

  try {
    const data = source.schema.parse(await source.load());
    const updatedAt = new Date().toISOString();
    await backend.set(key, { data, updatedAt }, source.staleTtlSeconds);
    await backend.clearFailure(`${CACHE_PREFIX}:failure:${source.id}`);
    return {
      result: {
        data,
        attribution: sourceAttribution(source),
        updatedAt,
        stale: false,
        ttlSeconds: source.ttlSeconds,
      },
    };
  } catch {
    await backend.recordFailure(`${CACHE_PREFIX}:failure:${source.id}`);
    return cached
      ? {
          result: {
            data: cached.data,
            attribution: sourceAttribution(source),
            updatedAt: cached.updatedAt,
            stale: true,
            ttlSeconds: source.ttlSeconds,
          },
        }
      : null;
  }
}

export async function consumeRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { allowed: true, remaining: 120 };
  }

  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);
  const count = await getCacheBackend().increment(
    `${CACHE_PREFIX}:rate:${identifier}:${Math.floor(Date.now() / 60_000)}`,
    70,
  );

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export function cacheBackendType(): "redis" | "memory" {
  return getCacheBackend().type();
}
