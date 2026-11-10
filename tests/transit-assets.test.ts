import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("transit model delivery", () => {
  for (const name of ["bus-tcm", "bus-transmac", "bus-stop", "lrt-platform", "lrt-car"]) {
    it(`${name} is a self-contained GLB within the rendering budget`, () => {
      const file = resolve("public/models", `${name}.glb`);
      const bytes = readFileSync(file);
      expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      expect(statSync(file).size).toBeLessThan(400_000);
      const length = bytes.readUInt32LE(12);
      const asset = JSON.parse(bytes.toString("utf8", 20, 20 + length));
      const primitiveCount = asset.meshes.reduce((count: number, mesh: { primitives: unknown[] }) => count + mesh.primitives.length, 0);
      expect(primitiveCount).toBeLessThanOrEqual(12);
      expect(asset.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    });
  }
});
