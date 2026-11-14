// Deliberate live checks using public landmark coordinates, never a user's position.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = process.env.ITINERARY_BASE_URL ?? 'http://localhost:3100';
const report = { base, checkedAt: new Date().toISOString(), checks: [] };
async function request(name, payload) {
  const started = Date.now();
  const response = await fetch(`${base}/api/v1/assistant/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'zh-Hant', ...payload }), signal: AbortSignal.timeout(100_000) });
  const body = await response.json();
  assert.equal(response.status, 200, `${name}: ${response.status} ${body.error ?? ''}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  report.checks.push({ name, kind: body.data.kind, milliseconds: Date.now() - started });
  return body.data;
}
const one = await request('single destination requests location', { question: '我想去澳門運動場' });
assert.equal(one.kind, 'location');
const point = await request('single destination plans from public landmark', { question: '我想去澳門運動場', destinationId: one.destination.id, origin: [113.5480582, 22.2013767] });
assert.equal(point.kind, 'plans'); assert.ok(point.options.length >= 1);
const ordered = await request('ordered school stadium temple', { question: '由澳門培正中學去澳門運動場，再去媽閣廟' });
assert.equal(ordered.kind, 'itineraries');
assert.deepEqual(ordered.options[0].stops.map(p => p.name), ['澳門培正中學', '澳門運動場', '媽閣廟']);
assert.equal(ordered.options[0].sections.length, 2);
assert.ok(ordered.options[0].sections.every(s => s.journeys.length));
const details = await request('day trip asks before recommending', { question: '幫我安排澳門傳統文化一日遊' });
assert.equal(details.kind, 'trip-details');
assert.deepEqual(details.missing, ['date', 'startTime', 'endTime', 'originQuery', 'endQuery', 'preferences']);
const date = new Date(Date.now() + (24 + 8) * 3600_000).toISOString().slice(0, 10);
const trip = { ...details.draft, date, startTime: '09:00', endTime: '18:00', originQuery: '澳門培正中學', endQuery: '澳門培正中學', preferences: '想睇廟宇同歷史建築，節奏輕鬆，可以搭巴士或步行' };
const day = await request('complete cultural alternatives', { question: '幫我安排澳門傳統文化一日遊', trip });
assert.equal(day.kind, 'itineraries');
assert.ok(day.options.length >= 2 && day.options.length <= 3);
for (const option of day.options) {
  assert.equal(option.sections.length, option.stops.length - 1);
  assert.ok(option.stops.filter(s => s.visit).every(s => s.sourceUrl && s.targetTime));
  assert.equal(option.stops.at(-1).id, option.stops[0].id);
}
const chosen = day.options[0];
const previousTrip = { ...day.draft, fixedStops: true, stops: chosen.stops.filter(s => s.visit).map(s => ({ query: s.name, placeId: s.id, stayMinutes: s.stayMinutes })) };
const edited = await request('natural-language edit retains day constraints', { question: '第一站改為停留45分鐘，其他保持原樣', previousTrip });
assert.equal(edited.kind, 'itineraries');
assert.equal(edited.draft.mode, 'day'); assert.equal(edited.draft.date, date);
assert.deepEqual(edited.options[0].stops.map(s => s.id), chosen.stops.map(s => s.id));
assert.equal(edited.options[0].stops.find(s => s.visit).stayMinutes, 45);
report.summary = { orderedSections: ordered.options[0].sections.length, dayAlternatives: day.options.length, dayDate: date, editedVisits: edited.options[0].stops.filter(s => s.visit).length };
if (process.env.ITINERARY_REPORT_PATH) await writeFile(process.env.ITINERARY_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
