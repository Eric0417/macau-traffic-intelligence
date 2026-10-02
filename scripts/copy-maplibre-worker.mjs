import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const targetDirectory = path.join(process.cwd(), "public", "maplibre");

await mkdir(targetDirectory, { recursive: true });

await Promise.all(
  ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"].map((file) =>
    copyFile(path.join(sourceDirectory, file), path.join(targetDirectory, file)),
  ),
);

console.log("Copied MapLibre worker assets to public/maplibre.");
