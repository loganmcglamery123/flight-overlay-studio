import { flightSnapshotAtProgress, type FlightAnalysis, type FlightPoint, type FlightStats } from "./flight";

export type UnitSystem = "metric" | "imperial";
export type OverlayStyle = "glass" | "light" | "minimal";
export type MediaFit = "cover" | "contain";
export type TrackOrientation = "north-up" | "best-fit" | "custom";
export type StatKey =
  | "totalDistance"
  | "distanceFromTakeoff"
  | "openDistance"
  | "triangleDistance"
  | "duration"
  | "averageSpeed"
  | "currentSpeed"
  | "maxAltitude"
  | "elevationGain"
  | "maxVario"
  | "minVario"
  | "currentVario";

export type OverlayElementId =
  | "track"
  | "elevation"
  | "stats";

export type OverlayElementFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayElementFrames = Record<OverlayElementId, OverlayElementFrame>;

export type OverlaySettings = {
  units: UnitSystem;
  style: OverlayStyle;
  fit: MediaFit;
  textColor: string;
  trackColor: string;
  elevationColor: string;
  panelOpacity: number;
  panelWidth: number;
  panelHeight: number;
  elementFrames: OverlayElementFrames;
  trackOrientation: TrackOrientation;
  trackRotation: number;
  showCompass: boolean;
  statLabelFontSize: number;
  statValueFontSize: number;
  statColumns: number;
  trackLineWidth: number;
  elevationLineWidth: number;
  elevationLabelFontSize: number;
  showStartAltitude: boolean;
  showMaxAltitude: boolean;
  showLandingAltitude: boolean;
  showTrack: boolean;
  showElevation: boolean;
  animateTrack: boolean;
  photoAnimationSpeed: number;
  enabledStats: StatKey[];
};

export const STAT_OPTIONS: Array<{ key: StatKey; label: string }> = [
  { key: "totalDistance", label: "Total track length" },
  { key: "distanceFromTakeoff", label: "Distance from takeoff" },
  { key: "openDistance", label: "3-turnpoint distance" },
  { key: "triangleDistance", label: "Triangle distance" },
  { key: "duration", label: "Duration" },
  { key: "averageSpeed", label: "Average speed" },
  { key: "currentSpeed", label: "Current speed" },
  { key: "maxAltitude", label: "Max elevation" },
  { key: "elevationGain", label: "Elevation gain" },
  { key: "maxVario", label: "Max climb" },
  { key: "minVario", label: "Max sink" },
  { key: "currentVario", label: "Current vario" },
];

export const DEFAULT_ELEMENT_FRAMES: OverlayElementFrames = {
  track: { x: 0, y: 0, width: 1, height: 0.64 },
  stats: { x: 0, y: 0.64, width: 1, height: 0.18 },
  elevation: { x: 0, y: 0.82, width: 1, height: 0.18 },
};

export function createDefaultElementFrames(): OverlayElementFrames {
  return Object.fromEntries(
    Object.entries(DEFAULT_ELEMENT_FRAMES).map(([key, frame]) => [key, { ...frame }]),
  ) as OverlayElementFrames;
}

export function createDefaultSettings(): OverlaySettings {
  return {
    units: "metric",
    style: "minimal",
    fit: "cover",
    textColor: "#ffffff",
    trackColor: "#fc4c02",
    elevationColor: "#ffffff",
    panelOpacity: 0.72,
    panelWidth: 0.92,
    panelHeight: 0.9,
    elementFrames: createDefaultElementFrames(),
    trackOrientation: "north-up",
    trackRotation: 0,
    showCompass: false,
    statLabelFontSize: 25,
    statValueFontSize: 60,
    statColumns: 2,
    trackLineWidth: 6,
    elevationLineWidth: 6,
    elevationLabelFontSize: 24,
    showStartAltitude: true,
    showMaxAltitude: true,
    showLandingAltitude: true,
    showTrack: true,
    showElevation: true,
    animateTrack: false,
    photoAnimationSpeed: 480,
    enabledStats: [
      "openDistance",
      "duration",
      "maxAltitude",
      "averageSpeed",
    ],
  };
}

export const DEFAULT_SETTINGS: OverlaySettings = createDefaultSettings();

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

function drawEmptyMedia(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  showHint: boolean,
) {
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

  if (showHint) {
    const unit = width / 1_200;
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.textAlign = "center";
    context.font = `600 ${Math.max(18, 28 * unit)}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText("Add a photo or video to begin", width / 2, height / 2 - 4 * unit);
    context.fillStyle = "rgba(255,255,255,0.5)";
    context.font = `500 ${Math.max(13, 15 * unit)}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText("Your files stay in this browser", width / 2, height / 2 + 28 * unit);
  }
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
  context.fillStyle = "#ffffff";
  context.fillText("N", labelX, labelY);
  context.restore();
}

function drawTrack(
  context: CanvasRenderingContext2D,
  visiblePoints: FlightPoint[],
  referencePoints: FlightPoint[],
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
  complete: boolean,
) {
  if (!visiblePoints.length || referencePoints.length < 2) return;
  const referenceSample = referencePoints.length <= 900
    ? referencePoints
    : Array.from({ length: 900 }, (_, index) => referencePoints[Math.round((index * (referencePoints.length - 1)) / 899)]);
  const visibleSample = visiblePoints.length <= 900
    ? visiblePoints
    : Array.from({ length: 900 }, (_, index) => visiblePoints[Math.round((index * (visiblePoints.length - 1)) / 899)]);
  const meanLatitude = referenceSample.reduce((total, point) => total + point.lat, 0) / referenceSample.length;
  const meanLongitude = referenceSample.reduce((total, point) => total + point.lon, 0) / referenceSample.length;
  const lonScale = Math.cos(toRadians(meanLatitude));
  const project = (point: FlightPoint) => ({
    x: (point.lon - meanLongitude) * lonScale,
    y: point.lat - meanLatitude,
  });
  const projectedReference = referenceSample.map(project);
  const projectedVisible = visibleSample.map(project);
  const padding = 13 * lineScale;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const rotation = orientation === "best-fit"
    ? bestFitTrackRotation(referencePoints, projectedReference, availableWidth, availableHeight)
    : orientation === "custom"
      ? -toRadians(customRotation)
      : 0;
  const rotatedVisible = projectedVisible.map((point) => rotateTrackPoint(point, rotation));
  const bounds = trackBounds(projectedReference, rotation);
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
  if (rotatedVisible.length > 1) {
    context.beginPath();
    rotatedVisible.forEach((point, index) => {
      const position = screenPosition(point);
      if (index === 0) context.moveTo(position.x, position.y);
      else context.lineTo(position.x, position.y);
    });
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, lineWidth * lineScale);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  const first = screenPosition(rotatedVisible[0]);
  const last = screenPosition(rotatedVisible.at(-1)!);
  const markerRadius = Math.max(3, (4.5 + lineWidth * 0.35) * lineScale);
  context.beginPath();
  context.arc(first.x, first.y, markerRadius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.beginPath();
  context.arc(first.x, first.y, markerRadius * 0.42, 0, Math.PI * 2);
  context.fillStyle = "rgba(8, 11, 14, 0.9)";
  context.fill();

  if (complete) {
    const crossRadius = markerRadius * 1.1;
    context.beginPath();
    context.moveTo(last.x - crossRadius, last.y - crossRadius);
    context.lineTo(last.x + crossRadius, last.y + crossRadius);
    context.moveTo(last.x + crossRadius, last.y - crossRadius);
    context.lineTo(last.x - crossRadius, last.y + crossRadius);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, lineWidth * lineScale);
    context.stroke();
  } else if (rotatedVisible.length > 1) {
    context.beginPath();
    context.arc(last.x, last.y, markerRadius * 0.72, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  }
  context.restore();

  if (showCompass) {
    drawCompass(context, x, y, width, height, rotation, color, lineScale);
  }
}

function drawElevation(
  context: CanvasRenderingContext2D,
  visiblePoints: FlightPoint[],
  referencePoints: FlightPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  labelColor: string,
  lineScale: number,
  lineWidth: number,
  units: UnitSystem,
  configuredLabelFontSize: number,
  labels: { start: boolean; max: boolean; landing: boolean },
  complete: boolean,
) {
  if (!visiblePoints.length || referencePoints.length < 2) return;
  const sampled = visiblePoints.length <= 500
    ? visiblePoints
    : Array.from({ length: 500 }, (_, index) => visiblePoints[Math.round((index * (visiblePoints.length - 1)) / 499)]);
  const minAltitude = Math.min(...referencePoints.map((point) => point.smoothedAltitude));
  const maxAltitude = Math.max(...referencePoints.map((point) => point.smoothedAltitude));
  const range = Math.max(1, maxAltitude - minAltitude);
  const totalDistance = Math.max(1, referencePoints.at(-1)!.cumulativeDistance);
  const horizontalPadding = 10 * lineScale;
  const topPadding = labels.max ? 29 * lineScale : 8 * lineScale;
  const bottomPadding = labels.start || (labels.landing && complete) ? 28 * lineScale : 8 * lineScale;
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
  const currentPosition = pointPosition(sampled.at(-1)!);
  fill.lineTo(currentPosition.x, baseline);
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

  const labelFontSize = Math.max(7, configuredLabelFontSize * lineScale);
  const drawLabel = (value: number, labelX: number, labelY: number, align: CanvasTextAlign) => {
    const label = formatAltitude(value, units);
    context.textAlign = align;
    context.textBaseline = "alphabetic";
    context.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, sans-serif`;
    context.fillStyle = labelColor;
    context.fillText(label, labelX, labelY, width * 0.42);
  };
  const drawPoint = (point: FlightPoint, markerColor = color) => {
    const position = pointPosition(point);
    context.beginPath();
    context.arc(position.x, position.y, Math.max(2.5, 3.2 * lineScale), 0, Math.PI * 2);
    context.fillStyle = markerColor;
    context.fill();
    return position;
  };

  const start = visiblePoints[0];
  const landing = visiblePoints.at(-1)!;
  const highest = visiblePoints.reduce((best, point) => (
    point.smoothedAltitude > best.smoothedAltitude ? point : best
  ));

  if (labels.start) {
    drawPoint(start);
    drawLabel(start.smoothedAltitude, plotLeft, y + height - 4 * lineScale, "left");
  }
  if (labels.landing && complete) {
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
    case "distanceFromTakeoff":
      return { label: "From takeoff", value: `${compactDistance(stats.distanceFromTakeoff, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "openDistance":
      return { label: "Distance", value: `${compactDistance(stats.openDistance, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "triangleDistance":
      return { label: "Triangle", value: `${compactDistance(stats.triangleDistance, metric ? 1_000 : 1_609.344)} ${metric ? "km" : "mi"}` };
    case "duration":
      return { label: "Duration", value: formatDuration(stats.duration) };
    case "averageSpeed":
      return { label: "Avg speed", value: `${(stats.averageSpeed * (metric ? 3.6 : 2.236_936)).toFixed(1)} ${metric ? "km/h" : "mph"}` };
    case "currentSpeed":
      return { label: "Speed", value: `${(stats.currentSpeed * (metric ? 3.6 : 2.236_936)).toFixed(1)} ${metric ? "km/h" : "mph"}` };
    case "maxAltitude":
      return { label: "Max elevation", value: formatAltitude(stats.maxAltitude, units) };
    case "elevationGain":
      return { label: "Elevation gain", value: formatAltitude(stats.elevationGain, units) };
    case "maxVario":
      return { label: "Max climb", value: `${(stats.maxVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
    case "minVario":
      return { label: "Max sink", value: `${(stats.minVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
    case "currentVario":
      return { label: "Vario", value: `${(stats.currentVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
  }
}

function designScale(width: number, height: number) {
  return width >= height
    ? Math.max(0.25, Math.min(width / 1_200, height / 675))
    : Math.max(0.25, Math.min(width / 1_080, height / 1_920));
}

function clampFrame(frame: OverlayElementFrame) {
  const width = Math.min(1, Math.max(0.03, frame.width));
  const height = Math.min(1, Math.max(0.03, frame.height));
  return {
    x: Math.min(1 - width, Math.max(0, frame.x)),
    y: Math.min(1 - height, Math.max(0, frame.y)),
    width,
    height,
  };
}

function resolveFrame(
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
  frame: OverlayElementFrame,
) {
  const safe = clampFrame(frame);
  return {
    x: panelX + safe.x * panelWidth,
    y: panelY + safe.y * panelHeight,
    width: safe.width * panelWidth,
    height: safe.height * panelHeight,
  };
}

function drawStatsGroup(
  context: CanvasRenderingContext2D,
  keys: StatKey[],
  stats: FlightStats,
  units: UnitSystem,
  frame: { x: number; y: number; width: number; height: number },
  color: string,
  lightPanel: boolean,
  lineScale: number,
  requestedColumns: number,
  labelFontSize: number,
  valueFontSize: number,
) {
  if (!keys.length) return;
  const columns = Math.max(1, Math.min(4, Math.round(requestedColumns)));
  const rows = Math.ceil(keys.length / columns);
  const columnGap = 14 * lineScale;
  const rowGap = 9 * lineScale;
  const cellWidth = Math.max(1, (frame.width - columnGap * (columns - 1)) / columns);
  const cellHeight = Math.max(1, (frame.height - rowGap * (rows - 1)) / rows);
  const labelSize = Math.max(7, labelFontSize * lineScale);
  const valueSize = Math.max(10, valueFontSize * lineScale);
  const textGap = Math.max(2, 3 * lineScale);

  context.save();
  context.beginPath();
  context.rect(frame.x, frame.y, frame.width, frame.height);
  context.clip();
  context.textAlign = "center";
  context.textBaseline = "top";

  keys.forEach((key, index) => {
    const stat = formatStat(key, stats, units);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = frame.x + column * (cellWidth + columnGap);
    const cellY = frame.y + row * (cellHeight + rowGap);
    const contentHeight = labelSize + textGap + valueSize;
    const contentY = cellY + Math.max(0, (cellHeight - contentHeight) / 2);
    const centerX = cellX + cellWidth / 2;

    context.font = `650 ${labelSize}px ui-sans-serif, system-ui, sans-serif`;
    context.fillStyle = lightPanel ? "rgba(16,22,26,0.62)" : rgba(color, 0.72);
    context.fillText(stat.label.toUpperCase(), centerX, contentY, cellWidth);
    context.font = `800 ${valueSize}px ui-sans-serif, system-ui, sans-serif`;
    context.fillStyle = color;
    context.fillText(stat.value, centerX, contentY + labelSize + textGap, cellWidth);
  });
  context.restore();
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  analysis: FlightAnalysis,
  settings: OverlaySettings,
  progress = 1,
) {
  const hasPanelContent = Boolean(settings.showTrack
    || settings.showElevation
    || settings.enabledStats.length);
  if (!hasPanelContent) return;

  const normalizedProgress = Math.min(1, Math.max(0, progress));
  const snapshot = flightSnapshotAtProgress(analysis, normalizedProgress);
  const complete = normalizedProgress >= 0.999_999;

  const panelWidth = width * Math.min(0.98, Math.max(0.3, settings.panelWidth));
  const panelHeight = height * Math.min(0.98, Math.max(0.3, settings.panelHeight));
  const panelX = (width - panelWidth) / 2;
  const panelY = (height - panelHeight) / 2;
  const scale = designScale(width, height);
  const isMinimal = settings.style === "minimal";
  const isLight = settings.style === "light";
  const effectiveText = isLight && settings.textColor === "#ffffff" ? "#10161a" : settings.textColor;

  context.save();
  if (!isMinimal) {
    roundedRect(context, panelX, panelY, panelWidth, panelHeight, 22 * scale);
    context.fillStyle = isLight
      ? `rgba(255,255,255,${Math.min(0.96, settings.panelOpacity)})`
      : `rgba(6,10,13,${settings.panelOpacity})`;
    context.fill();
    context.strokeStyle = isLight ? "rgba(12,20,24,0.12)" : "rgba(255,255,255,0.13)";
    context.lineWidth = Math.max(1, scale);
    context.stroke();
  }

  roundedRect(context, panelX, panelY, panelWidth, panelHeight, isMinimal ? 0 : 22 * scale);
  context.clip();

  if (settings.showTrack) {
    const frame = resolveFrame(panelX, panelY, panelWidth, panelHeight, settings.elementFrames.track);
    drawTrack(
      context,
      snapshot.points,
      analysis.points,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      settings.trackColor,
      scale,
      settings.trackLineWidth,
      settings.trackOrientation,
      settings.trackRotation,
      settings.showCompass,
      complete,
    );
  }

  if (settings.showElevation) {
    const frame = resolveFrame(panelX, panelY, panelWidth, panelHeight, settings.elementFrames.elevation);
    drawElevation(
      context,
      snapshot.points,
      analysis.points,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      settings.elevationColor,
      effectiveText,
      scale,
      settings.elevationLineWidth,
      settings.units,
      settings.elevationLabelFontSize,
      {
        start: settings.showStartAltitude,
        max: settings.showMaxAltitude,
        landing: settings.showLandingAltitude,
      },
      complete,
    );
  }

  drawStatsGroup(
    context,
    settings.enabledStats,
    snapshot.stats,
    settings.units,
    resolveFrame(panelX, panelY, panelWidth, panelHeight, settings.elementFrames.stats),
    effectiveText,
    isLight,
    scale,
    settings.statColumns,
    settings.statLabelFontSize,
    settings.statValueFontSize,
  );
  context.restore();
}

export function renderComposite(
  canvas: HTMLCanvasElement,
  media: DrawableMedia | null,
  analysis: FlightAnalysis | null,
  settings: OverlaySettings,
  transparent = false,
  progress = 1,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) {
    if (media) drawMedia(context, media, canvas.width, canvas.height, settings.fit);
    else drawEmptyMedia(context, canvas.width, canvas.height, !analysis);
  }
  if (analysis) drawOverlay(context, canvas.width, canvas.height, analysis, settings, progress);
}
