import type { Activity, RawActivity, Sample, SeriesKey, Split, Sport, Stats } from '../types';

const ROUTE_POINTS = 1500;
const SERIES_POINTS = 420;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const round1 = (v: number) => Math.round(v * 10) / 10;

function smooth(xs: number[], radius: number): number[] {
  const out = new Array<number>(xs.length);
  let sum = 0;
  let n = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < xs.length; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(xs.length - 1, i + radius);
    while (hi < b) { sum += xs[++hi]; n++; }
    while (lo < a) { sum -= xs[lo++]; n--; }
    out[i] = sum / n;
  }
  return out;
}

/** Sums climbing with a dead band, so GPS and barometer jitter does not count as elevation. */
export function elevationChange(ele: number[], band = 2): { gain: number; loss: number } {
  if (ele.length < 2) return { gain: 0, loss: 0 };
  const xs = smooth(ele, 3);
  let gain = 0;
  let loss = 0;
  let ref = xs[0];
  for (const v of xs) {
    const d = v - ref;
    if (d >= band) { gain += d; ref = v; }
    else if (d <= -band) { loss -= d; ref = v; }
  }
  return { gain, loss };
}

/** Coggan normalized power: 4th-power mean of a 30 s rolling average, resampled to 1 Hz. */
export function normalizedPower(seconds: number[], watts: number[]): number | undefined {
  if (watts.length < 2) return undefined;
  const t0 = seconds[0];
  const span = Math.floor(seconds[seconds.length - 1] - t0);
  if (span < 30) return undefined;
  const perSecond = new Array<number>(span + 1);
  let j = 0;
  for (let s = 0; s <= span; s++) {
    while (j + 1 < seconds.length && seconds[j + 1] - t0 <= s) j++;
    perSecond[s] = watts[j];
  }
  let rolling = 0;
  let acc = 0;
  let count = 0;
  for (let s = 0; s < perSecond.length; s++) {
    rolling += perSecond[s];
    if (s >= 30) rolling -= perSecond[s - 30];
    if (s >= 29) { acc += (rolling / 30) ** 4; count++; }
  }
  return count ? (acc / count) ** 0.25 : undefined;
}

function buildSplits(p: Prepared, size: number): Split[] {
  const out: Split[] = [];
  const { d, t, samples } = p;
  if (d.length < 2) return out;
  let startIdx = 0;
  let startT = t[0];
  let startD = d[0];
  let target = d[0] + size;
  const close = (i: number, endD: number, endT: number) => {
    const slice = samples.slice(startIdx, i + 1);
    const hr = mean(slice.flatMap((s) => (s.hr ? [s.hr] : [])));
    const eles = slice.flatMap((s) => (s.ele !== undefined ? [s.ele] : []));
    out.push({
      distance: endD - startD,
      time: Math.max(0, p.movingAt(endT) - p.movingAt(startT)),
      elev: eles.length > 1 ? eles[eles.length - 1] - eles[0] : 0,
      hr,
    });
  };
  for (let i = 1; i < d.length; i++) {
    while (d[i] >= target) {
      const span = d[i] - d[i - 1] || 1;
      const f = (target - d[i - 1]) / span;
      const crossT = t[i - 1] + (t[i] - t[i - 1]) * f;
      close(i, target, crossT);
      startIdx = i;
      startT = crossT;
      startD = target;
      target += size;
    }
  }
  const last = d.length - 1;
  // A sliver at the end of a track is noise, not a split.
  if (d[last] - startD > size * 0.05) close(last, d[last], t[last]);
  return out;
}

interface Prepared {
  samples: Sample[];
  t: number[]; // seconds from start
  d: number[]; // cumulative metres
  moving: number[]; // cumulative moving seconds
  movingAt: (t: number) => number;
}

function prepare(raw: RawActivity, sport: Sport | undefined): Prepared {
  const hasTime = raw.samples.some((s) => s.time !== undefined);
  const samples = raw.samples.filter((s) => !hasTime || s.time !== undefined);
  const t0 = samples[0]?.time ?? 0;
  const t = samples.map((s, i) => (hasTime ? (s.time! - t0) / 1000 : i));

  const d: number[] = [];
  let run = 0;
  let last: Sample | undefined;
  samples.forEach((s, i) => {
    if (s.dist !== undefined) run = Math.max(run, s.dist);
    else if (s.lat !== undefined && s.lon !== undefined) {
      if (last) run += haversine(last.lat!, last.lon!, s.lat, s.lon);
      last = s;
    } else if (s.speed !== undefined && i > 0) run += s.speed * (t[i] - t[i - 1]);
    d.push(run);
  });

  const threshold = sport === 'ride' ? 0.8 : 0.35;
  const moving = [0];
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    const v = dt > 0 ? (d[i] - d[i - 1]) / dt : 0;
    moving.push(moving[i - 1] + (v >= threshold ? dt : 0));
  }
  const movingAt = (time: number) => {
    let lo = 0;
    let hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid] <= time) lo = mid;
      else hi = mid - 1;
    }
    if (lo === t.length - 1) return moving[lo];
    const span = t[lo + 1] - t[lo] || 1;
    return moving[lo] + (moving[lo + 1] - moving[lo]) * ((time - t[lo]) / span);
  };
  return { samples, t, d, moving, movingAt };
}

function guessSport(metresPerSecond: number): Sport {
  if (metresPerSecond > 4.8) return 'ride';
  if (metresPerSecond > 1.9) return 'run';
  return metresPerSecond > 0 ? 'walk' : 'workout';
}

function resample(values: (number | undefined)[], x: number[], n: number): number[] | undefined {
  const pairs: [number, number][] = [];
  values.forEach((v, i) => { if (v !== undefined && Number.isFinite(v)) pairs.push([x[i], v]); });
  if (pairs.length < 8) return undefined;
  const x0 = pairs[0][0];
  const x1 = pairs[pairs.length - 1][0];
  if (x1 <= x0) return undefined;
  const out = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const at = x0 + ((x1 - x0) * i) / (n - 1);
    while (j + 1 < pairs.length - 1 && pairs[j + 1][0] < at) j++;
    const [xa, ya] = pairs[j];
    const [xb, yb] = pairs[Math.min(j + 1, pairs.length - 1)];
    out[i] = xb === xa ? ya : ya + ((yb - ya) * (at - xa)) / (xb - xa);
  }
  return out;
}

export function buildActivity(
  raw: RawActivity,
  meta: { id: string; source: Activity['source']; fallbackName: string },
): Activity {
  const provisional = raw.sport;
  const p = prepare(raw, provisional);
  const { samples, t, d } = p;
  const tot = raw.totals ?? {};
  const lastI = samples.length - 1;

  const distance = tot.distance ?? (lastI >= 0 ? d[lastI] : 0);
  const elapsedTime = tot.elapsedTime ?? (lastI >= 0 ? t[lastI] : 0);
  const movingTime = tot.movingTime ?? (p.moving[lastI] || elapsedTime);
  const avgSpeed = tot.avgSpeed ?? (movingTime > 0 ? distance / movingTime : undefined);
  const sport = raw.sport && raw.sport !== 'other' ? raw.sport : raw.sport ?? guessSport(avgSpeed ?? 0);

  const pick = (k: 'ele' | 'hr' | 'cad' | 'power' | 'temp') =>
    samples.flatMap((s) => (s[k] !== undefined ? [s[k]!] : []));
  const ele = pick('ele');
  const hr = pick('hr').filter((v) => v > 0);
  const cad = pick('cad').filter((v) => v > 0);
  const power = pick('power');
  const temp = pick('temp');
  const { gain, loss } = elevationChange(ele);

  // Sample speed is noisy, so derive it from smoothed distance when the device did not record it.
  const rawSpeed = samples.map((s, i) => {
    if (s.speed !== undefined) return s.speed;
    if (i === 0) return undefined;
    const lo = Math.max(0, i - 5);
    const dt = t[i] - t[lo];
    return dt > 0 ? (d[i] - d[lo]) / dt : undefined;
  });
  const speeds = rawSpeed.flatMap((v) => (v !== undefined ? [v] : []));
  const smoothMax = speeds.length ? Math.max(...smooth(speeds, 2)) : undefined;

  // Devices log run cadence per leg. Runners expect steps per minute.
  const runDouble = (sport === 'run' || sport === 'walk' || sport === 'hike') && (mean(cad) ?? 200) < 120;
  const cadScale = runDouble ? 2 : 1;
  const avgCad = tot.avgCadence ?? mean(cad);

  const powerSeconds: number[] = [];
  const powerValues: number[] = [];
  samples.forEach((s, i) => {
    if (s.power !== undefined) { powerSeconds.push(t[i]); powerValues.push(s.power); }
  });

  const stats: Stats = {
    distance,
    movingTime,
    elapsedTime: Math.max(elapsedTime, movingTime),
    elevGain: tot.elevGain ?? (ele.length ? round1(gain) : undefined),
    elevLoss: tot.elevLoss ?? (ele.length ? round1(loss) : undefined),
    maxEle: ele.length ? ele.reduce((a, b) => Math.max(a, b)) : undefined,
    minEle: ele.length ? ele.reduce((a, b) => Math.min(a, b)) : undefined,
    avgSpeed,
    maxSpeed: tot.maxSpeed ?? smoothMax,
    avgHr: tot.avgHr ?? mean(hr),
    maxHr: tot.maxHr ?? (hr.length ? hr.reduce((a, b) => Math.max(a, b)) : undefined),
    avgPower: tot.avgPower ?? mean(power),
    maxPower: tot.maxPower ?? (power.length ? power.reduce((a, b) => Math.max(a, b)) : undefined),
    normPower: tot.normPower ?? normalizedPower(powerSeconds, powerValues),
    avgCadence: avgCad !== undefined ? avgCad * cadScale : undefined,
    calories: tot.calories,
    avgTemp: mean(temp),
  };

  // Charts run on elapsed time unless the file has no clock, which leaves distance.
  const axis = t[lastI] > 0 ? t : d;
  const seriesSource: Record<SeriesKey, (number | undefined)[]> = {
    ele: samples.map((s) => s.ele),
    speed: rawSpeed,
    hr: samples.map((s) => (s.hr ? s.hr : undefined)),
    power: samples.map((s) => s.power),
    cad: samples.map((s) => (s.cad ? s.cad * cadScale : undefined)),
  };
  const series: Activity['series'] = {};
  const radius: Record<SeriesKey, number> = { ele: 2, speed: 5, hr: 2, power: 4, cad: 3 };
  for (const key of Object.keys(seriesSource) as SeriesKey[]) {
    const r = resample(seriesSource[key], axis, SERIES_POINTS);
    if (r) series[key] = smooth(r, radius[key]);
  }

  const located = samples
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.lat !== undefined && s.lon !== undefined && !(s.lat === 0 && s.lon === 0));
  const step = Math.max(1, located.length / ROUTE_POINTS);
  const route: Activity['route'] = { lat: [], lon: [] };
  const routeCols: Partial<Record<SeriesKey, number[]>> = {};
  const addCol = (key: SeriesKey, v: number | undefined) => { (routeCols[key] ??= []).push(v ?? NaN); };
  for (let f = 0; f < located.length; f += step) {
    const { s, i } = located[Math.floor(f)];
    route.lat.push(s.lat!);
    route.lon.push(s.lon!);
    addCol('ele', s.ele);
    addCol('speed', rawSpeed[i]);
    addCol('hr', s.hr);
    addCol('power', s.power);
    addCol('cad', s.cad);
  }
  if (located.length) {
    const { s } = located[located.length - 1];
    route.lat.push(s.lat!);
    route.lon.push(s.lon!);
    for (const key of Object.keys(routeCols) as SeriesKey[]) routeCols[key]!.push(routeCols[key]!.at(-1)!);
  }
  for (const key of Object.keys(routeCols) as SeriesKey[]) {
    const col = routeCols[key]!;
    if (col.some((v) => Number.isFinite(v))) route[key] = col;
  }

  return {
    id: meta.id,
    name: raw.name?.trim() || meta.fallbackName,
    sport,
    start: raw.start ?? Date.now(),
    source: meta.source,
    stats,
    route,
    series,
    splits: { km: buildSplits(p, 1000), mi: buildSplits(p, 1609.344) },
  };
}
