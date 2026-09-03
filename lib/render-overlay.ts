import type { FlightAnalysis, FlightPoint, FlightStats } from "./flight";

export type UnitSystem = "metric" | "imperial";
export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type OverlayStyle = "glass" | "light" | "minimal";
export type MediaFit = "cover" | "contain";
export type GraphLayout = "side-by-side" | "stacked";
export type TrackPlacement = "canvas-center" | "panel";
export type TrackOrientation = "north-up" | "best-fit" | "custom";
export type SportIcon = "none" | "paraglider" | "hang-glider" | "sailplane";
export type StatKey =
  | "totalDistance"
  | "openDistance"
  | "triangleDistance"
  | "duration"
  | "averageSpeed"
  | "maxAltitude"
  | "elevationGain"
  | "maxVario"
  | "minVario";

export type OverlaySettings = {
  title: string;
  units: UnitSystem;
  position: OverlayPosition;
  style: OverlayStyle;
  fit: MediaFit;
  accentColor: string;
  textColor: string;
  trackColor: string;
  elevationColor: string;
  panelOpacity: number;
  scale: number;
  overlayWidth: number;
  graphLayout: GraphLayout;
  trackPlacement: TrackPlacement;
  trackOrientation: TrackOrientation;
  trackRotation: number;
  trackCoverage: number;
  showCompass: boolean;
  sportIcon: SportIcon;
  trackScale: number;
  elevationScale: number;
  trackLineWidth: number;
  elevationLineWidth: number;
  showStartAltitude: boolean;
  showMaxAltitude: boolean;
  showLandingAltitude: boolean;
  showTrack: boolean;
  showElevation: boolean;
  enabledStats: StatKey[];
};

export const STAT_OPTIONS: Array<{ key: StatKey; label: string }> = [
  { key: "totalDistance", label: "Total track length" },
  { key: "openDistance", label: "3-turnpoint distance" },
  { key: "triangleDistance", label: "Triangle distance" },
  { key: "duration", label: "Duration" },
  { key: "averageSpeed", label: "Average speed" },
  { key: "maxAltitude", label: "Max elevation" },
  { key: "elevationGain", label: "Elevation gain" },
  { key: "maxVario", label: "Max climb" },
  { key: "minVario", label: "Max sink" },
];

export const DEFAULT_SETTINGS: OverlaySettings = {
  title: "",
  units: "metric",
  position: "bottom-left",
  style: "glass",
  fit: "cover",
  accentColor: "#d9ff43",
  textColor: "#ffffff",
  trackColor: "#ff6b2c",
  elevationColor: "#ffffff",
  panelOpacity: 0.72,
  scale: 1,
  overlayWidth: 0.62,
  graphLayout: "stacked",
  trackPlacement: "canvas-center",
  trackOrientation: "north-up",
  trackRotation: 0,
  trackCoverage: 0.72,
  showCompass: true,
  sportIcon: "paraglider",
  trackScale: 1,
  elevationScale: 1,
  trackLineWidth: 3,
  elevationLineWidth: 2.5,
  showStartAltitude: true,
  showMaxAltitude: true,
  showLandingAltitude: true,
  showTrack: true,
  showElevation: true,
  enabledStats: [
    "totalDistance",
    "openDistance",
    "triangleDistance",
    "duration",
    "maxAltitude",
    "elevationGain",
    "averageSpeed",
    "maxVario",
  ],
};

type DrawableMedia = HTMLImageElement | HTMLVideoElement;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 255, g: 255, b: 255 };
  const numeric = Number.parseInt(value, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mediaDimensions(media: DrawableMedia) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

export function drawMedia(
  context: CanvasRenderingContext2D,
  media: DrawableMedia,
  width: number,
  height: number,
  fit: MediaFit,
) {
  const source = mediaDimensions(media);
  if (!source.width || !source.height) return;

  context.save();
  context.fillStyle = "#080b0e";
  context.fillRect(0, 0, width, height);

  const ratio = fit === "cover"
    ? Math.max(width / source.width, height / source.height)
    : Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * ratio;
  const drawHeight = source.height * ratio;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(media, x, y, drawWidth, drawHeight);
  context.restore();
}

function drawEmptyMedia(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#111b22");
  gradient.addColorStop(0.55, "#0a1015");
  gradient.addColorStop(1, "#141a12");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(217, 255, 67, 0.08)";
  context.lineWidth = Math.max(1, width / 900);
  for (let offset = -height; offset < width + height; offset += width / 16) {
    context.beginPath();
    context.moveTo(offset, height);
    context.bezierCurveTo(
      offset + width * 0.12,
      height * 0.58,
      offset + width * 0.04,
      height * 0.35,
      offset + width * 0.25,
      0,
    );
    context.stroke();
  }
  context.restore();

  const unit = width / 1_200;
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.textAlign = "center";
  context.font = `600 ${Math.max(18, 28 * unit)}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText("Add a photo or video to begin", width / 2, height / 2 - 4 * unit);
  context.fillStyle = "rgba(255,255,255,0.5)";
  context.font = `500 ${Math.max(13, 15 * unit)}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText("Your files stay in this browser", width / 2, height / 2 + 28 * unit);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

type ProjectedTrackPoint = { x: number; y: number };

const bestFitRotationCache = new WeakMap<FlightPoint[], Map<string, number>>();

function rotateTrackPoint(point: ProjectedTrackPoint, radians: number) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function trackBounds(points: ProjectedTrackPoint[], radians: number) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const rotated = rotateTrackPoint(point, radians);
    minX = Math.min(minX, rotated.x);
    maxX = Math.max(maxX, rotated.x);
    minY = Math.min(minY, rotated.y);
    maxY = Math.max(maxY, rotated.y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    rangeX: Math.max(maxX - minX, 1e-9),
    rangeY: Math.max(maxY - minY, 1e-9),
  };
}

export function findBestFitRotation(
  points: Array<{ x: number; y: number }>,
  availableWidth: number,
  availableHeight: number,
) {
  let bestRadians = 0;
  let bestScale = 0;
  for (let degrees = -90; degrees <= 90; degrees += 1) {
    const radians = toRadians(degrees);
    const bounds = trackBounds(points, radians);
    const scale = Math.min(
      availableWidth / bounds.rangeX,
      availableHeight / bounds.rangeY,
    );
    if (
      scale > bestScale * 1.000_001 ||
      (Math.abs(scale - bestScale) <= bestScale * 0.000_001 && Math.abs(radians) < Math.abs(bestRadians))
    ) {
      bestScale = scale;
      bestRadians = radians;
    }
  }
  return bestRadians;
}

function bestFitTrackRotation(
  sourcePoints: FlightPoint[],
  points: ProjectedTrackPoint[],
  availableWidth: number,
  availableHeight: number,
) {
  const aspectKey = (availableWidth / Math.max(1, availableHeight)).toFixed(3);
  const cached = bestFitRotationCache.get(sourcePoints)?.get(aspectKey);
  if (cached !== undefined) return cached;

  const bestRadians = findBestFitRotation(points, availableWidth, availableHeight);

  const pointCache = bestFitRotationCache.get(sourcePoints) ?? new Map<string, number>();
  pointCache.set(aspectKey, bestRadians);
  bestFitRotationCache.set(sourcePoints, pointCache);
  return bestRadians;
}

function drawCompass(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  color: string,
  lineScale: number,
) {
  const size = Math.max(
    15 * lineScale,
    Math.min(30 * lineScale, Math.min(width, height) * 0.085),
  );
  const centerX = x + width - size * 1.2;
  const centerY = y + size * 1.2;
  const northX = -Math.sin(rotation);
  const northY = -Math.cos(rotation);
  const perpendicularX = -northY;
  const perpendicularY = northX;
  const tipX = centerX + northX * size * 0.58;
  const tipY = centerY + northY * size * 0.58;
  const baseX = centerX - northX * size * 0.18;
  const baseY = centerY - northY * size * 0.18;

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, size * 0.78, 0, Math.PI * 2);
  context.fillStyle = "rgba(5,8,10,0.42)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.38)";
  context.lineWidth = Math.max(1, lineScale);
  context.stroke();

  context.beginPath();
  context.moveTo(centerX + northX * size * 0.38, centerY + northY * size * 0.38);
  context.lineTo(centerX - northX * size * 0.42, centerY - northY * size * 0.42);
  context.strokeStyle = "rgba(255,255,255,0.68)";
  context.lineWidth = Math.max(1, 1.4 * lineScale);
  context.stroke();

  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(
    baseX + perpendicularX * size * 0.19,
    baseY + perpendicularY * size * 0.19,
  );
  context.lineTo(
    baseX - perpendicularX * size * 0.19,
    baseY - perpendicularY * size * 0.19,
  );
  context.closePath();
  context.fillStyle = color;
  context.fill();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${Math.max(8, 10.5 * lineScale)}px ui-sans-serif, system-ui, sans-serif`;
  const labelX = centerX + northX * size * 0.98;
  const labelY = centerY + northY * size * 0.98;
  context.strokeStyle = "rgba(0,0,0,0.82)";
  context.lineWidth = Math.max(2, 3 * lineScale);
  context.strokeText("N", labelX, labelY);
  context.fillStyle = "#ffffff";
  context.fillText("N", labelX, labelY);
  context.restore();
}

function drawSportIcon(
  context: CanvasRenderingContext2D,
  icon: SportIcon,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  if (icon === "none") return;
  const unit = size / 32;
  context.save();
  context.translate(x, y);
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  context.fillStyle = "rgba(5,8,10,0.48)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.32)";
  context.lineWidth = Math.max(1, unit);
  context.stroke();

  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1.4, 1.8 * unit);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (icon === "paraglider") {
    context.beginPath();
    context.moveTo(5 * unit, 13 * unit);
    context.quadraticCurveTo(16 * unit, 3.5 * unit, 27 * unit, 13 * unit);
    context.quadraticCurveTo(16 * unit, 9 * unit, 5 * unit, 13 * unit);
    context.stroke();
    context.beginPath();
    context.moveTo(5 * unit, 13 * unit);
    context.lineTo(14 * unit, 23 * unit);
    context.moveTo(27 * unit, 13 * unit);
    context.lineTo(18 * unit, 23 * unit);
    context.moveTo(16 * unit, 10 * unit);
    context.lineTo(16 * unit, 23 * unit);
    context.stroke();
    context.beginPath();
    context.arc(16 * unit, 25 * unit, 1.8 * unit, 0, Math.PI * 2);
    context.fill();
  } else if (icon === "hang-glider") {
    context.beginPath();
    context.moveTo(3.5 * unit, 11.5 * unit);
    context.lineTo(16 * unit, 6 * unit);
    context.lineTo(28.5 * unit, 11.5 * unit);
    context.lineTo(16 * unit, 17.5 * unit);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(3.5 * unit, 11.5 * unit);
    context.lineTo(28.5 * unit, 11.5 * unit);
    context.moveTo(16 * unit, 6 * unit);
    context.lineTo(16 * unit, 22 * unit);
    context.stroke();
    context.beginPath();
    context.arc(16 * unit, 24.5 * unit, 1.8 * unit, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(16 * unit, 4 * unit);
    context.lineTo(16 * unit, 27.5 * unit);
    context.moveTo(3.5 * unit, 14 * unit);
    context.lineTo(28.5 * unit, 14 * unit);
    context.moveTo(10.5 * unit, 23.5 * unit);
    context.lineTo(21.5 * unit, 23.5 * unit);
    context.stroke();
    context.beginPath();
    context.moveTo(16 * unit, 3.5 * unit);
    context.lineTo(13.5 * unit, 8 * unit);
    context.lineTo(18.5 * unit, 8 * unit);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function drawTrack(
  context: CanvasRenderingContext2D,
  points: FlightPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  lineScale: number,
  lineWidth: number,
  orientation: TrackOrientation,
  customRotation: number,
  showCompass: boolean,
) {
  if (points.length < 2) return;
  const sampled = points.length <= 900
    ? points
    : Array.from({ length: 900 }, (_, index) => points[Math.round((index * (points.length - 1)) / 899)]);
  const meanLatitude = sampled.reduce((total, point) => total + point.lat, 0) / sampled.length;
  const meanLongitude = sampled.reduce((total, point) => total + point.lon, 0) / sampled.length;
  const lonScale = Math.cos(toRadians(meanLatitude));
  const projected = sampled.map((point) => ({
    x: (point.lon - meanLongitude) * lonScale,
    y: point.lat - meanLatitude,
  }));
  const padding = 13 * lineScale;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const rotation = orientation === "best-fit"
    ? bestFitTrackRotation(points, projected, availableWidth, availableHeight)
    : orientation === "custom"
      ? -toRadians(customRotation)
      : 0;
  const rotated = projected.map((point) => rotateTrackPoint(point, rotation));
  const bounds = trackBounds(projected, rotation);
  const fitScale = Math.min(
    availableWidth / bounds.rangeX,
    availableHeight / bounds.rangeY,
  );
  const usedWidth = bounds.rangeX * fitScale;
  const usedHeight = bounds.rangeY * fitScale;
  const offsetX = x + (width - usedWidth) / 2;
  const offsetY = y + (height - usedHeight) / 2;

  const screenPosition = (point: ProjectedTrackPoint) => ({
    x: offsetX + (point.x - bounds.minX) * fitScale,
    y: offsetY + (bounds.maxY - point.y) * fitScale,
  });

  context.save();
  context.beginPath();
  rotated.forEach((point, index) => {
    const position = screenPosition(point);
    if (index === 0) context.moveTo(position.x, position.y);
    else context.lineTo(position.x, position.y);
  });
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, lineWidth * lineScale);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = rgba(color, 0.42);
  context.shadowBlur = 8 * lineScale;
  context.stroke();
  context.shadowBlur = 0;

  const first = screenPosition(rotated[0]);
  const last = screenPosition(rotated.at(-1)!);
  const markerRadius = Math.max(3, (4.5 + lineWidth * 0.35) * lineScale);
  context.beginPath();
  context.arc(first.x, first.y, markerRadius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.beginPath();
  context.arc(first.x, first.y, markerRadius * 0.42, 0, Math.PI * 2);
  context.fillStyle = "rgba(8, 11, 14, 0.9)";
  context.fill();

  const crossRadius = markerRadius * 1.1;
  context.beginPath();
  context.moveTo(last.x - crossRadius, last.y - crossRadius);
  context.lineTo(last.x + crossRadius, last.y + crossRadius);
  context.moveTo(last.x + crossRadius, last.y - crossRadius);
  context.lineTo(last.x - crossRadius, last.y + crossRadius);
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.5, lineWidth * lineScale);
  context.stroke();
  context.restore();

  if (showCompass) {
    drawCompass(context, x, y, width, height, rotation, color, lineScale);
  }
}

function drawElevation(
  context: CanvasRenderingContext2D,
  points: FlightPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  labelColor: string,
  lineScale: number,
  lineWidth: number,
  units: UnitSystem,
  labels: { start: boolean; max: boolean; landing: boolean },
) {
  if (points.length < 2) return;
  const sampled = points.length <= 500
    ? points
    : Array.from({ length: 500 }, (_, index) => points[Math.round((index * (points.length - 1)) / 499)]);
  const minAltitude = Math.min(...points.map((point) => point.smoothedAltitude));
  const maxAltitude = Math.max(...points.map((point) => point.smoothedAltitude));
  const range = Math.max(1, maxAltitude - minAltitude);
  const totalDistance = Math.max(1, points.at(-1)!.cumulativeDistance);
  const horizontalPadding = 10 * lineScale;
  const topPadding = labels.max ? 29 * lineScale : 8 * lineScale;
  const bottomPadding = labels.start || labels.landing ? 28 * lineScale : 8 * lineScale;
  const plotLeft = x + horizontalPadding;
  const plotRight = x + width - horizontalPadding;
  const plotTop = y + topPadding;
  const baseline = y + height - bottomPadding;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, baseline - plotTop);
  const pointPosition = (point: FlightPoint) => ({
    x: plotLeft + (point.cumulativeDistance / totalDistance) * plotWidth,
    y: baseline - ((point.smoothedAltitude - minAltitude) / range) * plotHeight,
  });

  context.save();
  const line = new Path2D();
  sampled.forEach((point, index) => {
    const position = pointPosition(point);
    if (index === 0) line.moveTo(position.x, position.y);
    else line.lineTo(position.x, position.y);
  });

  const fill = new Path2D(line);
  fill.lineTo(plotRight, baseline);
  fill.lineTo(plotLeft, baseline);
  fill.closePath();
  const gradient = context.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, rgba(color, 0.34));
  gradient.addColorStop(1, rgba(color, 0.025));
  context.fillStyle = gradient;
  context.fill(fill);
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, lineWidth * lineScale);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke(line);

  const labelFontSize = Math.max(8, 11.5 * lineScale);
  const drawLabel = (value: number, labelX: number, labelY: number, align: CanvasTextAlign) => {
    const label = formatAltitude(value, units);
    context.textAlign = align;
    context.textBaseline = "alphabetic";
    context.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, sans-serif`;
    context.lineJoin = "round";
    context.strokeStyle = "rgba(0,0,0,0.78)";
    context.lineWidth = Math.max(2, 3.2 * lineScale);
    context.strokeText(label, labelX, labelY, width * 0.42);
    context.fillStyle = labelColor;
    context.fillText(label, labelX, labelY, width * 0.42);
  };
  const drawPoint = (point: FlightPoint, markerColor = color) => {
    const position = pointPosition(point);
    context.beginPath();
    context.arc(position.x, position.y, Math.max(2.5, 3.2 * lineScale), 0, Math.PI * 2);
    context.fillStyle = markerColor;
    context.fill();
    context.strokeStyle = "rgba(0,0,0,0.65)";
    context.lineWidth = Math.max(1, 1.4 * lineScale);
    context.stroke();
    return position;
  };

  const start = points[0];
  const landing = points.at(-1)!;
  const highest = points.reduce((best, point) => (
    point.smoothedAltitude > best.smoothedAltitude ? point : best
  ));

  if (labels.start) {
    drawPoint(start);
    drawLabel(start.smoothedAltitude, plotLeft, y + height - 4 * lineScale, "left");
  }
  if (labels.landing) {
    drawPoint(landing);
    drawLabel(landing.smoothedAltitude, plotRight, y + height - 4 * lineScale, "right");
  }
  if (labels.max) {
    const position = drawPoint(highest);
    const edgeInset = 46 * lineScale;
    const clampedX = Math.min(plotRight - edgeInset, Math.max(plotLeft + edgeInset, position.x));
    drawLabel(highest.smoothedAltitude, clampedX, y + 17 * lineScale, "center");
  }
  context.restore();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function compactDistance(value: number, divisor: number) {
  const converted = value / divisor;
  const digits = converted < 10 ? 2 : 1;
  return converted.toFixed(digits);
}

export function formatAltitude(value: number, units: UnitSystem) {
  const metric = units === "metric";
  const converted = value * (metric ? 1 : 3.280_84);
  return `${Math.round(converted).toLocaleString("en-US")} ${metric ? "m" : "ft"}`;
}

export function formatStat(key: StatKey, stats: FlightStats, units: UnitSystem) {
  const metric = units === "metric";
  switch (key) {
    case "totalDistance":
      return { label: "Track length", value: `${compactDistance(stats.totalDistance, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "openDistance":
      return { label: "3 turn points", value: `${compactDistance(stats.openDistance, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "triangleDistance":
      return { label: "Triangle", value: `${compactDistance(stats.triangleDistance, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "duration":
      return { label: "Duration", value: formatDuration(stats.duration) };
    case "averageSpeed":
      return { label: "Avg speed", value: `${(stats.averageSpeed * (metric ? 3.6 : 2.236_936)).toFixed(1)} ${metric ? "km/h" : "mph"}` };
    case "maxAltitude":
      return { label: "Max elevation", value: formatAltitude(stats.maxAltitude, units) };
    case "elevationGain":
      return { label: "Elevation gain", value: formatAltitude(stats.elevationGain, units) };
    case "maxVario":
      return { label: "Max climb", value: `${(stats.maxVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
    case "minVario":
      return { label: "Max sink", value: `${(stats.minVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
  }
}

function panelLayout(width: number, height: number, settings: OverlaySettings) {
  let scale = Math.max(
    0.3,
    Math.min(width / 1_200, height / 675) * settings.scale,
  );
  const panelTrack = settings.showTrack && settings.trackPlacement === "panel";
  const hasVisual = panelTrack || settings.showElevation;

  const measure = (unit: number) => {
    const margin = 34 * unit;
    const availableWidth = Math.max(1, width - margin * 2);
    const requestedWidth = width * settings.overlayWidth;
    const panelWidth = Math.min(availableWidth, Math.max(340 * unit, requestedWidth));
    const innerWidth = panelWidth - 46 * unit;
    const titleHeight = settings.title.trim() || settings.sportIcon !== "none" ? 56 * unit : 0;
    const trackHeight = panelTrack ? 280 * unit * settings.trackScale : 0;
    const elevationHeight = settings.showElevation ? 132 * unit * settings.elevationScale : 0;
    const hasBoth = panelTrack && settings.showElevation;
    const graphGap = hasBoth ? 18 * unit : 0;
    const visualHeight = !hasVisual
      ? 0
      : hasBoth && settings.graphLayout === "stacked"
        ? trackHeight + graphGap + elevationHeight
        : Math.max(trackHeight, elevationHeight);
    const visualGap = hasVisual && settings.enabledStats.length ? 22 * unit : 0;
    const statColumns = width > height && panelWidth >= 590 * unit ? 4 : 2;
    const rows = Math.ceil(settings.enabledStats.length / statColumns);
    const statsHeight = rows * 57 * unit;
    const panelHeight = 46 * unit + titleHeight + visualHeight + visualGap + statsHeight;
    return {
      margin,
      panelWidth,
      innerWidth,
      panelHeight,
      titleHeight,
      visualHeight,
      visualGap,
      graphGap,
      trackHeight,
      elevationHeight,
      statColumns,
    };
  };

  let layout = measure(scale);
  const maxHeight = height - layout.margin * 2;
  if (layout.panelHeight > maxHeight && maxHeight > 0) {
    scale *= Math.max(0.24, (maxHeight / layout.panelHeight) * 0.985);
    layout = measure(scale);
  }

  const x = settings.position.endsWith("right")
    ? width - layout.margin - layout.panelWidth
    : layout.margin;
  const y = settings.position.startsWith("bottom")
    ? height - layout.margin - layout.panelHeight
    : layout.margin;

  return { ...layout, x, y, scale };
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  analysis: FlightAnalysis,
  settings: OverlaySettings,
) {
  const canvasScale = Math.max(
    0.3,
    Math.min(width / 1_200, height / 675) * settings.scale,
  );
  if (settings.showTrack && settings.trackPlacement === "canvas-center") {
    const coverage = Math.min(0.94, Math.max(0.42, settings.trackCoverage));
    const trackWidth = width * coverage;
    const trackHeight = height * coverage;
    drawTrack(
      context,
      analysis.points,
      (width - trackWidth) / 2,
      (height - trackHeight) / 2,
      trackWidth,
      trackHeight,
      settings.trackColor,
      canvasScale,
      settings.trackLineWidth,
      settings.trackOrientation,
      settings.trackRotation,
      settings.showCompass,
    );
  }

  const panelTrack = settings.showTrack && settings.trackPlacement === "panel";
  const hasPanelContent = Boolean(
    settings.title.trim() ||
    settings.sportIcon !== "none" ||
    panelTrack ||
    settings.showElevation ||
    settings.enabledStats.length,
  );
  if (!hasPanelContent) return;

  const layout = panelLayout(width, height, settings);
  const { x, y, panelWidth, panelHeight, innerWidth, scale } = layout;
  const padding = 23 * scale;
  const isMinimal = settings.style === "minimal";
  const isLight = settings.style === "light";
  const effectiveText = isLight && settings.textColor === "#ffffff" ? "#10161a" : settings.textColor;

  context.save();
  if (!isMinimal) {
    roundedRect(context, x, y, panelWidth, panelHeight, 22 * scale);
    context.fillStyle = isLight
      ? `rgba(255,255,255,${Math.min(0.96, settings.panelOpacity)})`
      : `rgba(6,10,13,${settings.panelOpacity})`;
    context.fill();
    context.strokeStyle = isLight ? "rgba(12,20,24,0.12)" : "rgba(255,255,255,0.13)";
    context.lineWidth = Math.max(1, scale);
    context.stroke();
  } else {
    context.shadowColor = "rgba(0,0,0,0.85)";
    context.shadowBlur = 10 * scale;
  }

  let cursorY = y + padding;
  const contentX = x + padding;
  if (layout.titleHeight) {
    const iconSize = 34 * scale;
    const hasIcon = settings.sportIcon !== "none";
    if (hasIcon) {
      drawSportIcon(
        context,
        settings.sportIcon,
        contentX,
        cursorY,
        iconSize,
        settings.accentColor,
      );
    }
    const titleX = contentX + (hasIcon ? 46 * scale : 0);
    context.textAlign = "left";
    if (settings.title.trim()) {
      context.fillStyle = effectiveText;
      context.font = `700 ${27 * scale}px ui-sans-serif, system-ui, sans-serif`;
      context.fillText(
        settings.title.trim().slice(0, 54),
        titleX,
        cursorY + 25 * scale,
        innerWidth - (titleX - contentX),
      );
      context.fillStyle = settings.accentColor;
      context.fillRect(titleX, cursorY + 38 * scale, 46 * scale, 3 * scale);
    }
    cursorY += layout.titleHeight;
  }

  if (layout.visualHeight) {
    const both = panelTrack && settings.showElevation;
    const stacked = both && settings.graphLayout === "stacked";
    if (stacked) {
      drawTrack(
        context,
        analysis.points,
        contentX,
        cursorY,
        innerWidth,
        layout.trackHeight,
        settings.trackColor,
        scale,
        settings.trackLineWidth,
        settings.trackOrientation,
        settings.trackRotation,
        settings.showCompass,
      );
      cursorY += layout.trackHeight + layout.graphGap;
      drawElevation(
        context,
        analysis.points,
        contentX,
        cursorY,
        innerWidth,
        layout.elevationHeight,
        settings.elevationColor,
        effectiveText,
        scale,
        settings.elevationLineWidth,
        settings.units,
        {
          start: settings.showStartAltitude,
          max: settings.showMaxAltitude,
          landing: settings.showLandingAltitude,
        },
      );
      cursorY += layout.elevationHeight;
    } else {
      const gap = both ? 16 * scale : 0;
      const itemWidth = both ? (innerWidth - gap) / 2 : innerWidth;
      if (panelTrack) {
        drawTrack(
          context,
          analysis.points,
          contentX,
          cursorY + (layout.visualHeight - layout.trackHeight) / 2,
          itemWidth,
          layout.trackHeight,
          settings.trackColor,
          scale,
          settings.trackLineWidth,
          settings.trackOrientation,
          settings.trackRotation,
          settings.showCompass,
        );
      }
      if (settings.showElevation) {
        drawElevation(
          context,
          analysis.points,
          contentX + (both ? itemWidth + gap : 0),
          cursorY + (layout.visualHeight - layout.elevationHeight) / 2,
          itemWidth,
          layout.elevationHeight,
          settings.elevationColor,
          effectiveText,
          scale,
          settings.elevationLineWidth,
          settings.units,
          {
            start: settings.showStartAltitude,
            max: settings.showMaxAltitude,
            landing: settings.showLandingAltitude,
          },
        );
      }
      cursorY += layout.visualHeight;
    }
    cursorY += layout.visualGap;
  }

  const columnWidth = innerWidth / layout.statColumns;
  settings.enabledStats.forEach((key, index) => {
    const stat = formatStat(key, analysis.stats, settings.units);
    const column = index % layout.statColumns;
    const row = Math.floor(index / layout.statColumns);
    const statX = contentX + column * columnWidth;
    const statY = cursorY + row * 57 * scale;
    context.textAlign = "left";
    context.fillStyle = isLight ? "rgba(16,22,26,0.56)" : rgba(effectiveText, 0.62);
    context.font = `600 ${11.5 * scale}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText(stat.label.toUpperCase(), statX, statY + 11 * scale, columnWidth - 8 * scale);
    context.fillStyle = effectiveText;
    context.font = `700 ${21 * scale}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText(stat.value, statX, statY + 36 * scale, columnWidth - 8 * scale);
  });
  context.restore();
}

export function renderComposite(
  canvas: HTMLCanvasElement,
  media: DrawableMedia | null,
  analysis: FlightAnalysis | null,
  settings: OverlaySettings,
  transparent = false,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) {
    if (media) drawMedia(context, media, canvas.width, canvas.height, settings.fit);
    else drawEmptyMedia(context, canvas.width, canvas.height);
  }
  if (analysis) drawOverlay(context, canvas.width, canvas.height, analysis, settings);
}
