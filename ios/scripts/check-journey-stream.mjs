// Deliberate live check with public landmarks, separate from fixture-only tests.
const endpoint = new URL('api/v1/assistant/journeys', process.argv[2] ?? 'https://macau-traffic-intelligence.onrender.com/');
const body = JSON.stringify({ question: '由議事亭前地去澳門大熊貓館，點搭巴士？', locale: 'zh-Hant' });
const started = performance.now();
const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body });
if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error(`Stream unavailable: ${response.status}`);
const decoder = new TextDecoder();
let buffer = '', firstCandidatesMs = null, finalMs = null, finalKind, optionCount;
const phases = [];
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const event = JSON.parse(line);
    const ms = Math.round(performance.now() - started);
    if (event.type === 'phase') phases.push({ phase: event.phase, ms });
    if (event.type === 'candidates') {
      firstCandidatesMs = ms;
      if (!event.data.options.length || !event.data.warnings.length) throw new Error('Candidate contract incomplete');
    }
    if (event.type === 'complete') {
      finalMs = ms; finalKind = event.envelope.data.kind;
      optionCount = event.envelope.data.options?.length ?? 0;
      if (event.envelope.meta.source.id !== 'assistant') throw new Error('Invalid source');
    }
    if (event.type === 'error') throw new Error(event.error);
  }
}
if (firstCandidatesMs === null || finalMs === null || finalKind !== 'plans' || !optionCount) throw new Error('Incomplete journey stream');
console.log(JSON.stringify({ timestamp: new Date().toISOString(), status: response.status, firstCandidatesMs, finalMs, finalKind, optionCount, phases }, null, 2));
