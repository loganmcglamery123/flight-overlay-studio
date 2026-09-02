import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

after(async () => vite.close());

test("parses valid B records and computes core flight statistics", async () => {
  const { parseIgc } = await vite.ssrLoadModule("/lib/flight.ts");
  const igc = [
    "AXXXFLIGHTOVERLAY",
    "HFDTE010826",
    "HFPLTPILOTINCHARGE:Test Pilot",
    "B1200004500000N12200000WA0100001020",
    "B1201004500600N12159400WA0110001120",
    "B1202004501200N12159400WA0120001220",
    "B1203004501200N12200000WA0115001170",
    "B1204004500000N12200000WA0105001070",
  ].join("\n");

  const result = parseIgc(igc);
  assert.equal(result.points.length, 5);
  assert.equal(result.stats.duration, 240);
  assert.ok(result.stats.totalDistance > 3_000);
  assert.ok(result.stats.openDistance > 0);
  assert.ok(result.stats.triangleDistance > 0);
  assert.equal(result.metadata.date, "2026-08-01");
  assert.equal(result.metadata.pilot, "Test Pilot");
});

test("rejects a file without a usable track", async () => {
  const { parseIgc } = await vite.ssrLoadModule("/lib/flight.ts");
  assert.throws(() => parseIgc("AXXX\nHFDTE010826"), /two valid IGC B-record fixes/);
});
