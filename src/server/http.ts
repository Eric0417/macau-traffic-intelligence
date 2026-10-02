import "server-only";

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly url: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST";
  headers?: HeadersInit;
  body?: BodyInit;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, text/html, application/xml, text/xml, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  "User-Agent": "MacauTrafficIntelligence/0.1 (+https://github.com/keithligh/hk-traffic-intelligence reference)",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...DEFAULT_HEADERS,
          ...options.headers,
        },
        body: options.body,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UpstreamError(`Upstream returned ${response.status}`, response.status, url);
      }

      return await response.text();
    } catch (error) {
      const retryable =
        attempt < retries &&
        (error instanceof UpstreamError
          ? error.status === null || error.status >= 500
          : true);

      if (!retryable) {
        if (error instanceof UpstreamError) {
          throw error;
        }

        throw new UpstreamError(error instanceof Error ? error.message : "Upstream request failed", null, url);
      }

      await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 120));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new UpstreamError("Upstream request exhausted retries", null, url);
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const body = await fetchText(url, options);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new UpstreamError("Upstream returned invalid JSON", null, url);
  }
}
