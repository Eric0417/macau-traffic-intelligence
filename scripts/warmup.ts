const baseUrl = (
	process.env.WARMUP_BASE_URL ?? "http://localhost:3100"
).replace(/\/$/u, "");

const prefix = "/api/v1/" as const;

const targets = [
	"health",
	"traffic/roads",
	"traffic/bridges",
	"traffic/notices",
	"cameras",
	"bus/routes",
	"parking",
	"weather",
	"lrt/network",
	"lrt/notices",
] as const;

const optionalTargets = [prefix + "borders"] as const;

async function hit(path: string, optional: boolean) {
	const startedAt = Date.now();
	try {
		const response = await fetch(`${baseUrl}${path}`, {
			signal: AbortSignal.timeout(90_000),
		});
		return {
			path,
			status: response.status,
			ok: response.ok,
			optional,
			durationMs: Date.now() - startedAt,
		};
	} catch (error) {
		return {
			path,
			status: 0,
			ok: false,
			optional,
			durationMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function main() {
	const results = [];
	for (const path of targets) {
		results.push(await hit(prefix + path, false));
	}
	for (const path of optionalTargets) {
		results.push(await hit(path, true));
	}

	for (const result of results) {
		const label = result.ok ? "ok  " : result.optional ? "warn" : "fail";
		console.log(
			`${label} ${result.path.padEnd(30)} ${result.status || "-"} ${result.durationMs}ms${
				"error" in result && result.error ? ` ${result.error}` : ""
			}`
		);
	}

	if (results.some((result) => !result.ok && !result.optional)) {
		process.exitCode = 1;
	}
}

void main();
