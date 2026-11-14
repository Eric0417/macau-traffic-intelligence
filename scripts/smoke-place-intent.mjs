// Deliberate live-provider checks using public landmark names.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.ITINERARY_BASE_URL ?? "http://localhost:3100";
const report = { base, checkedAt: new Date().toISOString(), checks: [] };
async function request(name, payload) {
  const started = Date.now();
  const response = await fetch(`${base}/api/v1/assistant/journeys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "zh-Hant", ...payload }), signal: AbortSignal.timeout(100_000) });
  const body = await response.json();
  assert.equal(response.status, 200, `${name}: ${response.status} ${body.error ?? ""}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  report.checks.push({ name, kind: body.data.kind, milliseconds: Date.now() - started });
  return body.data;
}
const single = await request("natural-language temple typo", { question: "我想去媽角廟" });
assert.ok(single.kind === "location" || single.kind === "choose");
const singlePlaces = single.kind === "location" ? [single.destination] : single.choices;
assert.ok(singlePlaces.some(p => p.name.includes("媽閣廟")));

let trip = { mode: "ordered", originQuery: "澳門培証中學", stops: [{ query: "媽角" }, { query: "澳門運動場" }] };
let result;
for (let attempt = 0; attempt < 4; attempt++) {
  result = await request(attempt ? "continue with chosen real place" : "correct typed origin and ordered destination", { question: "由澳門培証中學去媽角，再去澳門運動場", trip });
  if (result.kind === "itineraries") break;
  assert.equal(result.kind, "trip-choice");
  const expected = result.field === "origin" ? "澳門培正中學" : result.field === 0 ? "媽閣廟" : "澳門運動場";
  const selected = result.choices.find(p => p.name === expected);
  assert.ok(selected, `Missing real choice ${expected}`);
  trip = result.draft;
  if (result.field === "origin") { trip.originId = selected.id; trip.originQuery = selected.name; }
  else { trip.stops[result.field] = { ...trip.stops[result.field], query: selected.name, placeId: selected.id }; }
}
assert.equal(result.kind, "itineraries");
assert.equal(result.options[0].sections.length, 2);
const names = result.options[0].stops.map(p => p.name);
assert.equal(names[0], "澳門培正中學");
assert.ok(names[1].includes("媽閣"));
assert.equal(names[2], "澳門運動場");
report.resolvedStops = names;
if (process.env.ITINERARY_REPORT_PATH) await writeFile(process.env.ITINERARY_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
