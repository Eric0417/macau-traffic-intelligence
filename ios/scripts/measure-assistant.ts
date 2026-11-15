import { loadEnvConfig } from '@next/env';
import { performance } from 'node:perf_hooks';

loadEnvConfig(process.cwd());
const fetchOriginal = globalThis.fetch;
const requests: Array<{ kind: string; ms: number; status: number }> = [];
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const start = performance.now();
  const input = args[0];
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const response = await fetchOriginal(...args);
  await response.clone().arrayBuffer();
  requests.push({ kind: url.pathname.endsWith('/chat/completions') ? 'model' : 'source', ms: Math.round(performance.now() - start), status: response.status });
  return response;
};
async function main() {
  const { planAssistantJourney } = await import('../../src/server/sources/assistant-journeys');
  const start = performance.now();
  let firstCandidatesMs: number | undefined;
  const { data } = await planAssistantJourney({ question: '由議事亭前地去澳門大熊貓館，點搭巴士？', locale: 'zh-Hant' }, event => { if (event.type === 'candidates') firstCandidatesMs = Math.round(performance.now() - start); });
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), totalMs: Math.round(performance.now() - start), firstCandidatesMs, kind: data.kind, options: data.kind === 'plans' ? data.options.map(option => ({ id: option.journey.id, routes: option.journey.legs.map(leg => leg.routeName), copyLength: option.title.length + option.reason.length })) : [], requests }, null, 2));
  process.exit(0);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Probe failed'); process.exit(1); });
