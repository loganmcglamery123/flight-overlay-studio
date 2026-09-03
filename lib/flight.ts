export type FlightPoint = {
  lat: number;
  lon: number;
  altitude: number;
  pressureAltitude: number | null;
  gpsAltitude: number | null;
  seconds: number;
  elapsed: number;
  cumulativeDistance: number;
  smoothedAltitude: number;
};

export type FlightStats = {
  totalDistance: number;
  distanceFromTakeoff: number;
  openDistance: number;
  triangleDistance: number;
  duration: number;
  averageSpeed: number;
  currentSpeed: number;
  maxAltitude: number;
  minAltitude: number;
  elevationGain: number;
  maxVario: number;
  minVario: number;
  currentVario: number;
};

export type FlightAnalysis = {
  points: FlightPoint[];
  stats: FlightStats;
  metadata: {
    date: string | null;
    pilot: string | null;
    glider: string | null;
  };
  openRoute: FlightPoint[];
  triangleRoute: FlightPoint[];
  ignoredFixes: number;
};

export type FlightSnapshot = {
  points: FlightPoint[];
  stats: FlightStats;
};

const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversine(a: Pick<FlightPoint, "lat" | "lon">, b: Pick<FlightPoint, "lat" | "lon">) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function headerValue(lines: string[], keys: string[]) {
  for (const line of lines) {
    for (const key of keys) {
      if (line.startsWith(key)) {
        const value = line.slice(key.length).trim();
        return value || null;
      }
    }
  }
  return null;
}

function parseDate(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/);
    if (!match) continue;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const shortYear = Number(match[3]);
    const year = shortYear >= 80 ? 1900 + shortYear : 2000 + shortYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

type RawPoint = Omit<FlightPoint, "elapsed" | "cumulativeDistance" | "smoothedAltitude">;

function parseBRecord(line: string, dayOffset: number): RawPoint | null {
  if (!line.startsWith("B") || line.length < 35) return null;

  const hours = Number(line.slice(1, 3));
  const minutes = Number(line.slice(3, 5));
  const seconds = Number(line.slice(5, 7));
  const latDegrees = Number(line.slice(7, 9));
  const latMinutes = Number(line.slice(9, 14)) / 1_000;
  const latHemisphere = line.slice(14, 15);
  const lonDegrees = Number(line.slice(15, 18));
  const lonMinutes = Number(line.slice(18, 23)) / 1_000;
  const lonHemisphere = line.slice(23, 24);
  const validity = line.slice(24, 25);
  const pressureAltitude = Number(line.slice(25, 30));
  const gpsAltitude = Number(line.slice(30, 35));

  const values = [hours, minutes, seconds, latDegrees, latMinutes, lonDegrees, lonMinutes];
  if (values.some((value) => !Number.isFinite(value)) || validity !== "A") return null;
  if (hours > 23 || minutes > 59 || seconds > 59 || latMinutes >= 60 || lonMinutes >= 60) return null;

  let lat = latDegrees + latMinutes / 60;
  let lon = lonDegrees + lonMinutes / 60;
  if (latHemisphere === "S") lat *= -1;
  if (lonHemisphere === "W") lon *= -1;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const validGps = Number.isFinite(gpsAltitude) ? gpsAltitude : null;
  const validPressure = Number.isFinite(pressureAltitude) ? pressureAltitude : null;
  const altitude = validGps ?? validPressure;
  if (altitude === null) return null;

  return {
    lat,
    lon,
    altitude,
    pressureAltitude: validPressure,
    gpsAltitude: validGps,
    seconds: hours * 3_600 + minutes * 60 + seconds + dayOffset,
  };
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function downsample<T>(items: T[], limit: number) {
  if (items.length <= limit) return items.map((item, index) => ({ item, index }));
  const result: Array<{ item: T; index: number }> = [];
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (limit - 1));
    result.push({ item: items[index], index });
  }
  return result;
}

function distanceMatrix(points: FlightPoint[]) {
  const size = points.length;
  const matrix = new Float64Array(size * size);
  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      const distance = haversine(points[i], points[j]);
      matrix[i * size + j] = distance;
      matrix[j * size + i] = distance;
    }
  }
  return matrix;
}

function optimizeOpenDistance(points: FlightPoint[]) {
  const sampled = downsample(points, 320);
  const routePoints = sampled.map(({ item }) => item);
  const size = routePoints.length;
  if (size < 2) return { distance: 0, route: routePoints };

  const matrix = distanceMatrix(routePoints);
  let previous = new Float64Array(size);
  const predecessors: Int32Array[] = [];

  // Four legs means a start, three turn points, and a finish.
  for (let leg = 1; leg <= 4; leg += 1) {
    const current = new Float64Array(size);
    current.fill(Number.NEGATIVE_INFINITY);
    const priorIndex = new Int32Array(size);
    priorIndex.fill(-1);

    for (let finish = 1; finish < size; finish += 1) {
      for (let start = 0; start < finish; start += 1) {
        if (!Number.isFinite(previous[start])) continue;
        const candidate = previous[start] + matrix[start * size + finish];
        if (candidate > current[finish]) {
          current[finish] = candidate;
          priorIndex[finish] = start;
        }
      }
    }

    previous = current;
    predecessors.push(priorIndex);
  }

  let bestFinish = 0;
  for (let i = 1; i < size; i += 1) {
    if (previous[i] > previous[bestFinish]) bestFinish = i;
  }

  if (!Number.isFinite(previous[bestFinish])) {
    return { distance: 0, route: [routePoints[0], routePoints[size - 1]] };
  }

  const indices = [bestFinish];
  let cursor = bestFinish;
  for (let leg = 3; leg >= 0; leg -= 1) {
    cursor = predecessors[leg][cursor];
    if (cursor < 0) break;
    indices.push(cursor);
  }
  indices.reverse();

  return {
    distance: previous[bestFinish],
    route: indices.map((index) => routePoints[index]),
  };
}

function optimizeTriangle(points: FlightPoint[]) {
  const sampled = downsample(points, 180);
  const routePoints = sampled.map(({ item }) => item);
  const size = routePoints.length;
  if (size < 3) return { distance: 0, route: routePoints };
  const matrix = distanceMatrix(routePoints);
  let bestDistance = 0;
  let bestIndices = [0, Math.floor(size / 2), size - 1];

  for (let first = 0; first < size - 2; first += 1) {
    for (let second = first + 1; second < size - 1; second += 1) {
      const firstLeg = matrix[first * size + second];
      for (let third = second + 1; third < size; third += 1) {
        const perimeter =
          firstLeg +
          matrix[second * size + third] +
          matrix[third * size + first];
        if (perimeter > bestDistance) {
          bestDistance = perimeter;
          bestIndices = [first, second, third];
        }
      }
    }
  }

  return {
    distance: bestDistance,
    route: bestIndices.map((index) => routePoints[index]),
  };
}

export function parseIgc(text: string): FlightAnalysis {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rawPoints: RawPoint[] = [];
  let dayOffset = 0;
  let lastClockSeconds: number | null = null;
  let ignoredFixes = 0;

  for (const line of lines) {
    if (!line.startsWith("B")) continue;
    const clock = Number(line.slice(1, 7));
    if (Number.isFinite(clock) && lastClockSeconds !== null && clock < lastClockSeconds - 120_000) {
      dayOffset += 86_400;
    }
    const point = parseBRecord(line, dayOffset);
    if (!point) {
      ignoredFixes += 1;
      continue;
    }
    lastClockSeconds = clock;

    const previous = rawPoints.at(-1);
    if (previous) {
      const deltaTime = point.seconds - previous.seconds;
      if (deltaTime <= 0) {
        ignoredFixes += 1;
        continue;
      }
      const speed = haversine(previous as FlightPoint, point as FlightPoint) / deltaTime;
      if (speed > 69.45) {
        // 250 km/h is safely beyond plausible paraglider groundspeed and usually signals a bad fix.
        ignoredFixes += 1;
        continue;
      }
    }
    rawPoints.push(point);
  }

  if (rawPoints.length < 2) {
    throw new Error("This file does not contain at least two valid IGC B-record fixes.");
  }

  const startSeconds = rawPoints[0].seconds;
  let cumulativeDistance = 0;
  const altitudes = rawPoints.map((point) => point.altitude);
  const points: FlightPoint[] = rawPoints.map((point, index) => {
    if (index > 0) cumulativeDistance += haversine(rawPoints[index - 1] as FlightPoint, point as FlightPoint);
    const from = Math.max(0, index - 2);
    const to = Math.min(rawPoints.length, index + 3);
    return {
      ...point,
      elapsed: point.seconds - startSeconds,
      cumulativeDistance,
      smoothedAltitude: median(altitudes.slice(from, to)),
    };
  });

  let maxVario = Number.NEGATIVE_INFINITY;
  let minVario = Number.POSITIVE_INFINITY;
  let windowStart = 0;
  for (let index = 1; index < points.length; index += 1) {
    while (windowStart < index - 1 && points[index].seconds - points[windowStart].seconds > 8) {
      windowStart += 1;
    }
    const deltaTime = points[index].seconds - points[windowStart].seconds;
    if (deltaTime >= 3) {
      const vario = (points[index].smoothedAltitude - points[windowStart].smoothedAltitude) / deltaTime;
      maxVario = Math.max(maxVario, vario);
      minVario = Math.min(minVario, vario);
    }
  }

  const duration = points.at(-1)!.elapsed;
  const open = optimizeOpenDistance(points);
  const triangle = optimizeTriangle(points);
  const smoothedAltitudes = points.map((point) => point.smoothedAltitude);
  const maxAltitude = Math.max(...smoothedAltitudes);
  const elevationGain = Math.max(0, maxAltitude - points[0].smoothedAltitude);
  const lastPoint = points.at(-1)!;
  let motionStart = Math.max(0, points.length - 2);
  while (motionStart > 0 && lastPoint.seconds - points[motionStart].seconds < 5) {
    motionStart -= 1;
  }
  const motionDuration = lastPoint.seconds - points[motionStart].seconds;
  const currentSpeed = motionDuration > 0
    ? (lastPoint.cumulativeDistance - points[motionStart].cumulativeDistance) / motionDuration
    : 0;
  const currentVario = motionDuration > 0
    ? (lastPoint.smoothedAltitude - points[motionStart].smoothedAltitude) / motionDuration
    : 0;

  return {
    points,
    stats: {
      totalDistance: cumulativeDistance,
      distanceFromTakeoff: haversine(points[0], lastPoint),
      openDistance: open.distance,
      triangleDistance: triangle.distance,
      duration,
      averageSpeed: duration > 0 ? cumulativeDistance / duration : 0,
      currentSpeed,
      maxAltitude,
      minAltitude: Math.min(...smoothedAltitudes),
      elevationGain,
      maxVario: Number.isFinite(maxVario) ? maxVario : 0,
      minVario: Number.isFinite(minVario) ? minVario : 0,
      currentVario,
    },
    metadata: {
      date: parseDate(lines),
      pilot: headerValue(lines, ["HFPLTPILOTINCHARGE:", "HFPLTPILOT:"]),
      glider: headerValue(lines, ["HFGTYGLIDERTYPE:"]),
    },
    openRoute: open.route,
    triangleRoute: triangle.route,
    ignoredFixes,
  };
}

function interpolateNumber(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function interpolateNullable(start: number | null, end: number | null, ratio: number) {
  if (start === null || end === null) return end ?? start;
  return interpolateNumber(start, end, ratio);
}

function interpolatedPoint(start: FlightPoint, end: FlightPoint, elapsed: number): FlightPoint {
  const span = Math.max(1e-9, end.elapsed - start.elapsed);
  const ratio = Math.min(1, Math.max(0, (elapsed - start.elapsed) / span));
  return {
    lat: interpolateNumber(start.lat, end.lat, ratio),
    lon: interpolateNumber(start.lon, end.lon, ratio),
    altitude: interpolateNumber(start.altitude, end.altitude, ratio),
    pressureAltitude: interpolateNullable(start.pressureAltitude, end.pressureAltitude, ratio),
    gpsAltitude: interpolateNullable(start.gpsAltitude, end.gpsAltitude, ratio),
    seconds: interpolateNumber(start.seconds, end.seconds, ratio),
    elapsed,
    cumulativeDistance: interpolateNumber(start.cumulativeDistance, end.cumulativeDistance, ratio),
    smoothedAltitude: interpolateNumber(start.smoothedAltitude, end.smoothedAltitude, ratio),
  };
}

export function flightSnapshotAtProgress(analysis: FlightAnalysis, progress: number): FlightSnapshot {
  const normalized = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
  if (normalized >= 1) return { points: analysis.points, stats: analysis.stats };

  const fullPoints = analysis.points;
  const cutoff = analysis.stats.duration * normalized;
  let low = 0;
  let high = fullPoints.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fullPoints[middle].elapsed <= cutoff) low = middle;
    else high = middle - 1;
  }

  const visiblePoints = fullPoints.slice(0, low + 1);
  const lastKnown = visiblePoints.at(-1)!;
  const next = fullPoints[low + 1];
  if (next && cutoff > lastKnown.elapsed) {
    visiblePoints.push(interpolatedPoint(lastKnown, next, cutoff));
  }

  const first = visiblePoints[0];
  const last = visiblePoints.at(-1)!;
  let maxAltitude = first.smoothedAltitude;
  let minAltitude = first.smoothedAltitude;
  let maxVario = Number.NEGATIVE_INFINITY;
  let minVario = Number.POSITIVE_INFINITY;
  let windowStart = 0;
  for (let index = 1; index < visiblePoints.length; index += 1) {
    const point = visiblePoints[index];
    maxAltitude = Math.max(maxAltitude, point.smoothedAltitude);
    minAltitude = Math.min(minAltitude, point.smoothedAltitude);
    while (windowStart < index - 1 && point.seconds - visiblePoints[windowStart].seconds > 8) {
      windowStart += 1;
    }
    const deltaTime = point.seconds - visiblePoints[windowStart].seconds;
    if (deltaTime >= 3) {
      const vario = (point.smoothedAltitude - visiblePoints[windowStart].smoothedAltitude) / deltaTime;
      maxVario = Math.max(maxVario, vario);
      minVario = Math.min(minVario, vario);
    }
  }

  let motionStart = Math.max(0, visiblePoints.length - 2);
  while (motionStart > 0 && last.seconds - visiblePoints[motionStart].seconds < 5) {
    motionStart -= 1;
  }
  const motionDuration = last.seconds - visiblePoints[motionStart].seconds;
  const totalDistance = last.cumulativeDistance;
  const distanceFraction = analysis.stats.totalDistance > 0
    ? totalDistance / analysis.stats.totalDistance
    : normalized;

  return {
    points: visiblePoints,
    stats: {
      totalDistance,
      distanceFromTakeoff: haversine(first, last),
      openDistance: analysis.stats.openDistance * distanceFraction,
      triangleDistance: analysis.stats.triangleDistance * distanceFraction,
      duration: last.elapsed,
      averageSpeed: last.elapsed > 0 ? totalDistance / last.elapsed : 0,
      currentSpeed: motionDuration > 0
        ? (last.cumulativeDistance - visiblePoints[motionStart].cumulativeDistance) / motionDuration
        : 0,
      maxAltitude,
      minAltitude,
      elevationGain: Math.max(0, maxAltitude - first.smoothedAltitude),
      maxVario: Number.isFinite(maxVario) ? maxVario : 0,
      minVario: Number.isFinite(minVario) ? minVario : 0,
      currentVario: motionDuration > 0
        ? (last.smoothedAltitude - visiblePoints[motionStart].smoothedAltitude) / motionDuration
        : 0,
    },
  };
}
