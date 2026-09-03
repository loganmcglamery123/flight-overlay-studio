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
  assert.equal(
    result.stats.elevationGain,
    result.stats.maxAltitude - result.points[0].smoothedAltitude,
  );
  assert.equal(result.metadata.date, "2026-08-01");
  assert.equal(result.metadata.pilot, "Test Pilot");
});

test("rejects a file without a usable track", async () => {
  const { parseIgc } = await vite.ssrLoadModule("/lib/flight.ts");
  assert.throws(() => parseIgc("AXXX\nHFDTE010826"), /two valid IGC B-record fixes/);
});

test("formats altitude labels and exposes direct-edit overlay defaults", async () => {
  const { DEFAULT_SETTINGS, findBestFitRotation, formatAltitude } = await vite.ssrLoadModule("/lib/render-overlay.ts");

  assert.equal(formatAltitude(1_000, "metric"), "1,000 m");
  assert.equal(formatAltitude(1_000, "imperial"), "3,281 ft");
  assert.notEqual(DEFAULT_SETTINGS.trackColor, DEFAULT_SETTINGS.elevationColor);
  assert.equal(DEFAULT_SETTINGS.showStartAltitude, true);
  assert.equal(DEFAULT_SETTINGS.showMaxAltitude, true);
  assert.equal(DEFAULT_SETTINGS.showLandingAltitude, true);
  assert.equal(DEFAULT_SETTINGS.style, "minimal");
  assert.equal(DEFAULT_SETTINGS.trackOrientation, "north-up");
  assert.ok(DEFAULT_SETTINGS.panelWidth > 0.85);
  assert.ok(DEFAULT_SETTINGS.panelHeight > 0.85);
  assert.ok(DEFAULT_SETTINGS.elementFrames.track.width > 0.8);
  assert.ok(DEFAULT_SETTINGS.elementFrames.track.height > 0.4);
  assert.ok(DEFAULT_SETTINGS.elementFrames.stats.width > 0.8);
  assert.equal(DEFAULT_SETTINGS.statColumns, 2);
  assert.ok(DEFAULT_SETTINGS.statValueFontSize > DEFAULT_SETTINGS.statLabelFontSize);
  assert.equal(
    DEFAULT_SETTINGS.elementFrames.sportIcon.x + DEFAULT_SETTINGS.elementFrames.sportIcon.width / 2,
    0.5,
  );
  assert.ok(DEFAULT_SETTINGS.elementFrames.sportIcon.y > 0.9);
  assert.equal(DEFAULT_SETTINGS.showCompass, false);
  assert.equal(DEFAULT_SETTINGS.sportIcon, "paraglider");
  assert.deepEqual(DEFAULT_SETTINGS.enabledStats, [
    "openDistance",
    "duration",
    "maxAltitude",
    "averageSpeed",
  ]);

  const rotation = findBestFitRotation(
    [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 10 }],
    1_000,
    200,
  );
  assert.ok(Math.abs(rotation) > 1.2);
});
