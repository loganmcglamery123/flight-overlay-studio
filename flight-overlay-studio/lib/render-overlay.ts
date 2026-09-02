import type { FlightAnalysis, FlightPoint, FlightStats } from "./flight";

export type UnitSystem = "metric" | "imperial";
export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type OverlayStyle = "glass" | "light" | "minimal";
export type MediaFit = "cover" | "contain";
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
  panelOpacity: number;
  scale: number;
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
  panelOpacity: 0.72,
  scale: 1,
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

function drawTrack(
  context: CanvasRenderingContext2D,
  points: FlightPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string,
  lineScale: number,
) {
  if (points.length < 2) return;
  const sampled = points.length <= 900
    ? points
    : Array.from({ length: 900 }, (_, index) => points[Math.round((index * (points.length - 1)) / 899)]);
  const meanLatitude = sampled.reduce((total, point) => total + point.lat, 0) / sampled.length;
  const lonScale = Math.cos(toRadians(meanLatitude));
  const projected = sampled.map((point) => ({ x: point.lon * lonScale, y: point.lat }));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const rangeX = Math.max(maxX - minX, 1e-9);
  const rangeY = Math.max(maxY - minY, 1e-9);
  const padding = 9 * lineScale;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const fitScale = Math.min(availableWidth / rangeX, availableHeight / rangeY);
  const usedWidth = rangeX * fitScale;
  const usedHeight = rangeY * fitScale;
  const offsetX = x + (width - usedWidth) / 2;
  const offsetY = y + (height - usedHeight) / 2;

  context.save();
  context.beginPath();
  projected.forEach((point, index) => {
    const px = offsetX + (point.x - minX) * fitScale;
    const py = offsetY + (maxY - point.y) * fitScale;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, 3 * lineScale);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = rgba(accent, 0.42);
  context.shadowBlur = 8 * lineScale;
  context.stroke();
  context.shadowBlur = 0;

  const first = projected[0];
  const last = projected.at(-1)!;
  for (const [point, fill] of [[first, accent], [last, "#ffffff"]] as const) {
    const px = offsetX + (point.x - minX) * fitScale;
    const py = offsetY + (maxY - point.y) * fitScale;
    context.beginPath();
    context.arc(px, py, Math.max(3, 4.5 * lineScale), 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
  }
  context.restore();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function drawElevation(
  context: CanvasRenderingContext2D,
  points: FlightPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string,
  lineScale: number,
) {
  if (points.length < 2) return;
  const sampled = points.length <= 500
    ? points
    : Array.from({ length: 500 }, (_, index) => points[Math.round((index * (points.length - 1)) / 499)]);
  const minAltitude = Math.min(...sampled.map((point) => point.smoothedAltitude));
  const maxAltitude = Math.max(...sampled.map((point) => point.smoothedAltitude));
  const range = Math.max(1, maxAltitude - minAltitude);
  const totalDistance = Math.max(1, sampled.at(-1)!.cumulativeDistance);
  const pad = 8 * lineScale;
  const baseline = y + height - pad;

  context.save();
  const line = new Path2D();
  sampled.forEach((point, index) => {
    const px = x + pad + (point.cumulativeDistance / totalDistance) * (width - pad * 2);
    const py = baseline - ((point.smoothedAltitude - minAltitude) / range) * (height - pad * 2);
    if (index === 0) line.moveTo(px, py);
    else line.lineTo(px, py);
  });

  const fill = new Path2D(line);
  fill.lineTo(x + width - pad, baseline);
  fill.lineTo(x + pad, baseline);
  fill.closePath();
  const gradient = context.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, rgba(accent, 0.34));
  gradient.addColorStop(1, rgba(accent, 0.02));
  context.fillStyle = gradient;
  context.fill(fill);
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, 2.5 * lineScale);
  context.lineJoin = "round";
  context.stroke(line);
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
      return { label: "Max elevation", value: `${Math.round(stats.maxAltitude * (metric ? 1 : 3.280_84)).toLocaleString("en-US")} ${metric ? "m" : "ft"}` };
    case "elevationGain":
      return { label: "Elevation gain", value: `${Math.round(stats.elevationGain * (metric ? 1 : 3.280_84)).toLocaleString("en-US")} ${metric ? "m" : "ft"}` };
    case "maxVario":
      return { label: "Max climb", value: `${(stats.maxVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
    case "minVario":
      return { label: "Max sink", value: `${(stats.minVario * (metric ? 1 : 196.850_4)).toFixed(metric ? 1 : 0)} ${metric ? "m/s" : "ft/min"}` };
  }
}

function panelLayout(width: number, height: number, settings: OverlaySettings) {
  let scale = Math.max(0.45, (width / 1_200) * settings.scale);
  const hasVisual = settings.showTrack || settings.showElevation;

  const measure = (unit: number) => {
    const margin = 34 * unit;
    const panelWidth = Math.min(width - margin * 2, Math.max(350 * unit, Math.min(width * 0.52, 600 * unit)));
    const innerWidth = panelWidth - 46 * unit;
    const titleHeight = settings.title.trim() ? 54 * unit : 20 * unit;
    const visualHeight = hasVisual ? 144 * unit : 0;
    const visualGap = hasVisual ? 19 * unit : 0;
    const rows = Math.ceil(settings.enabledStats.length / 2);
    const statsHeight = rows * 57 * unit;
    const panelHeight = 23 * unit + titleHeight + visualHeight + visualGap + statsHeight + 20 * unit;
    return { margin, panelWidth, innerWidth, panelHeight, titleHeight, visualHeight, visualGap };
  };

  let layout = measure(scale);
  const maxHeight = height - layout.margin * 2;
  if (layout.panelHeight > maxHeight && maxHeight > 0) {
    scale *= Math.max(0.55, maxHeight / layout.panelHeight);
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
  if (settings.title.trim()) {
    context.textAlign = "left";
    context.fillStyle = effectiveText;
    context.font = `700 ${27 * scale}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText(settings.title.trim().slice(0, 54), contentX, cursorY + 25 * scale, innerWidth);
    context.fillStyle = settings.accentColor;
    context.fillRect(contentX, cursorY + 38 * scale, 46 * scale, 3 * scale);
    cursorY += layout.titleHeight;
  } else {
    cursorY += layout.titleHeight;
  }

  if (layout.visualHeight) {
    const both = settings.showTrack && settings.showElevation;
    const gap = 14 * scale;
    const itemWidth = both ? (innerWidth - gap) / 2 : innerWidth;
    if (settings.showTrack) {
      drawTrack(
        context,
        analysis.points,
        contentX,
        cursorY,
        itemWidth,
        layout.visualHeight,
        settings.accentColor,
        scale,
      );
    }
    if (settings.showElevation) {
      drawElevation(
        context,
        analysis.points,
        contentX + (both ? itemWidth + gap : 0),
        cursorY,
        itemWidth,
        layout.visualHeight,
        settings.accentColor,
        scale,
      );
    }
    cursorY += layout.visualHeight + layout.visualGap;
  }

  const columnWidth = innerWidth / 2;
  settings.enabledStats.forEach((key, index) => {
    const stat = formatStat(key, analysis.stats, settings.units);
    const column = index % 2;
    const row = Math.floor(index / 2);
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
