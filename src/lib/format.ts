import type { Activity, MetricId, Sport, Stats, Units } from '../types';

export interface MetricValue { id: MetricId; label: string; value: string; unit: string }

/** "2h 05m", "45m 12s". One time style across every template. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function formatPace(secondsPerUnit: number): string {
  const s = Math.round(secondsPerUnit);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const KM_PER_MI = 1.609344;
const FT_PER_M = 3.28084;

export const distanceIn = (m: number, u: Units) => (u === 'metric' ? m / 1000 : m / 1000 / KM_PER_MI);
export const speedIn = (mps: number, u: Units) => (u === 'metric' ? mps * 3.6 : (mps * 3.6) / KM_PER_MI);
export const elevIn = (m: number, u: Units) => (u === 'metric' ? m : m * FT_PER_M);

const group = (v: number) => Math.round(v).toLocaleString('en-US');
const distUnit = (u: Units) => (u === 'metric' ? 'km' : 'mi');
const elevUnit = (u: Units) => (u === 'metric' ? 'm' : 'ft');
const speedUnit = (u: Units) => (u === 'metric' ? 'km/h' : 'mph');

type Row = { label: string; read: (s: Stats, u: Units) => [string, string] | null };
const has = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);

export const METRICS: Record<MetricId, Row> = {
  distance: {
    label: 'Distance',
    read: (s, u) => (s.distance > 0 ? [distanceIn(s.distance, u).toFixed(2), distUnit(u)] : null),
  },
  movingTime: { label: 'Time', read: (s) => (s.movingTime > 0 ? [formatDuration(s.movingTime), ''] : null) },
  elapsedTime: { label: 'Elapsed', read: (s) => (s.elapsedTime > 0 ? [formatDuration(s.elapsedTime), ''] : null) },
  pace: {
    label: 'Pace',
    read: (s, u) => {
      if (!has(s.avgSpeed) || s.avgSpeed <= 0) return null;
      const perUnit = (u === 'metric' ? 1000 : 1609.344) / s.avgSpeed;
      return [formatPace(perUnit), `/${distUnit(u)}`];
    },
  },
  speed: {
    label: 'Avg speed',
    read: (s, u) => (has(s.avgSpeed) && s.avgSpeed > 0 ? [speedIn(s.avgSpeed, u).toFixed(1), speedUnit(u)] : null),
  },
  maxSpeed: {
    label: 'Max speed',
    read: (s, u) => (has(s.maxSpeed) && s.maxSpeed > 0 ? [speedIn(s.maxSpeed, u).toFixed(1), speedUnit(u)] : null),
  },
  elevGain: { label: 'Elevation', read: (s, u) => (has(s.elevGain) ? [group(elevIn(s.elevGain, u)), elevUnit(u)] : null) },
  elevLoss: { label: 'Descent', read: (s, u) => (has(s.elevLoss) ? [group(elevIn(s.elevLoss, u)), elevUnit(u)] : null) },
  maxEle: { label: 'High point', read: (s, u) => (has(s.maxEle) ? [group(elevIn(s.maxEle, u)), elevUnit(u)] : null) },
  avgHr: { label: 'Avg HR', read: (s) => (has(s.avgHr) ? [group(s.avgHr), 'bpm'] : null) },
  maxHr: { label: 'Max HR', read: (s) => (has(s.maxHr) ? [group(s.maxHr), 'bpm'] : null) },
  avgPower: { label: 'Avg power', read: (s) => (has(s.avgPower) ? [group(s.avgPower), 'W'] : null) },
  maxPower: { label: 'Max power', read: (s) => (has(s.maxPower) ? [group(s.maxPower), 'W'] : null) },
  normPower: { label: 'Norm. power', read: (s) => (has(s.normPower) ? [group(s.normPower), 'W'] : null) },
  avgCadence: { label: 'Cadence', read: (s) => (has(s.avgCadence) ? [group(s.avgCadence), 'rpm'] : null) },
  calories: { label: 'Calories', read: (s) => (has(s.calories) && s.calories > 0 ? [group(s.calories), 'kcal'] : null) },
  avgTemp: {
    label: 'Temp',
    read: (s, u) => (has(s.avgTemp) ? (u === 'metric' ? [group(s.avgTemp), '°C'] : [group(s.avgTemp * 1.8 + 32), '°F']) : null),
  },
};

export const ALL_METRICS = Object.keys(METRICS) as MetricId[];

export function metricValue(id: MetricId, a: Activity, u: Units): MetricValue | null {
  const row = METRICS[id];
  const read = row.read(a.stats, u);
  if (!read) return null;
  const unit = id === 'avgCadence' && a.sport !== 'ride' ? 'spm' : read[1];
  return { id, label: row.label, value: read[0], unit };
}

export function defaultMetrics(sport: Sport): MetricId[] {
  switch (sport) {
    case 'ride': return ['distance', 'movingTime', 'speed', 'elevGain', 'normPower', 'avgHr'];
    case 'run': return ['distance', 'movingTime', 'pace', 'elevGain', 'avgHr', 'avgCadence'];
    case 'walk':
    case 'hike': return ['distance', 'movingTime', 'elevGain', 'pace', 'avgHr'];
    case 'swim': return ['distance', 'movingTime', 'pace', 'avgHr'];
    default: return ['movingTime', 'avgHr', 'maxHr', 'calories'];
  }
}

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run', ride: 'Ride', walk: 'Walk', hike: 'Hike', swim: 'Swim', workout: 'Workout', other: 'Activity',
};

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
