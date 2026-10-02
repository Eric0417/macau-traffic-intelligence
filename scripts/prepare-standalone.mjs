import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

await mkdir(path.join(standalone, ".next"), { recursive: true });
await Promise.all([
  cp(path.join(root, "public"), path.join(standalone, "public"), {
    recursive: true,
    force: true,
  }),
  cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
    recursive: true,
    force: true,
  }),
]);

console.log("Prepared public and static assets for the standalone server.");
