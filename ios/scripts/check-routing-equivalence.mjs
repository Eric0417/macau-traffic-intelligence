// Offline differential check against the last deployed routing implementation.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const baseline = '50cf7bb';
const directory = await mkdtemp(join(tmpdir(), 'macao-routing-'));
try {
  const previous = execFileSync('git', ['show', `${baseline}:src/lib/bus-journey.ts`], { encoding: 'utf8' });
  await build({ stdin: { contents: previous, loader: 'ts', resolveDir: join(process.cwd(), 'src/lib') }, bundle: true, format: 'esm', platform: 'node', outfile: join(directory, 'before.mjs') });
  await build({ entryPoints: ['src/lib/bus-journey.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(directory, 'after.mjs') });
  const before = await import(pathToFileURL(join(directory, 'before.mjs')).href);
  const after = await import(pathToFileURL(join(directory, 'after.mjs')).href);
  let state = 7193, cases = 0;
  const random = limit => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 0x100000000 * limit); };
  for (let graph = 0; graph < 200; graph++) {
    const stops = Array.from({ length: 8 }, (_, i) => ({ stationCode: `S${i}`, stationName: `S${i}`, coordinates: [113.54 + i * .0005, 22.19] }));
    const routes = Array.from({ length: 9 }, (_, i) => ({ routeCode: String(i + 1), routeName: String(i + 1), direction: random(2), circular: false,
      company: { id: 'a', name: 'Test', color: 'orange' }, stops: Array.from({ length: 2 + random(7) }, () => stops[random(stops.length)]),
      ...(random(2) ? { serviceWindows: [[0, 360]] } : {}) }));
    const network = { routes, fetchedAt: '2026-11-09T00:00:00Z', coverage: { catalogRoutes: routes.length, loadedRoutes: routes.length, missingRoutes: [] } };
    for (let query = 0; query < 8; query++) {
      const origin = query % 2 ? { coordinates: stops[random(8)].coordinates } : { stationCode: `S${random(8)}` };
      const destination = { stationCode: `S${random(8)}` };
      const options = { departureMinute: [undefined, 180, 720][random(3)], unavailableStops: new Map([[String(1 + random(9)), new Set([`S${random(8)}`])]]) };
      const expected = before.planBusJourneys(network, origin, destination, options);
      const actual = after.planBusJourneys(network, origin, destination, options);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Mismatch at graph ${graph}, query ${query}`);
      cases++;
    }
  }
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), baseline, seed: 7193, graphs: 200, cases, identical: true }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
