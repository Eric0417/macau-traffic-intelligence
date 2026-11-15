import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["ios/Planner/bridge.ts"],
  outfile: "ios/MacauTraffic/Resources/planner.js",
  bundle: true,
  format: "iife",
  globalName: "NativePlanner",
  target: "safari26",
  legalComments: "none",
});
