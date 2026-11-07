export type Sport = 'run' | 'ride' | 'walk' | 'hike' | 'swim' | 'workout' | 'other';
export type Units = 'metric' | 'imperial';

/** One recorded sample, as parsers emit it. Every field is optional because devices differ. */
export interface Sample {
  time?: number; // epoch ms
  lat?: number;
  lon?: number;
  ele?: number;
  hr?: number;
  cad?: number;
  power?: number;
  dist?: number; // cumulative metres
  speed?: number; // m/s
  temp?: number;
}

/** Totals a source reports itself. These beat anything derived from samples. */
export interface Totals {
  distance?: number;
  movingTime?: number;
  elapsedTime?: number;
  elevGain?: number;
  elevLoss?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  maxPower?: number;
  normPower?: number;
  avgCadence?: number;
  calories?: number;
}

export interface RawActivity {
  name?: string;
  sport?: Sport;
  start?: number;
  samples: Sample[];
  totals?: Totals;
}

export interface Stats extends Totals {
  distance: number;
  movingTime: number;
  elapsedTime: number;
  maxEle?: number;
  minEle?: number;
  avgTemp?: number;
}

export type SeriesKey = 'ele' | 'speed' | 'hr' | 'power' | 'cad';

export interface Split {
  distance: number; // metres in this split
  time: number; // seconds
  elev: number; // net metres
  hr?: number;
}

export interface Activity {
  id: string;
  name: string;
  sport: Sport;
  start: number;
  source: 'file' | 'sample';
  stats: Stats;
  /** Downsampled GPS track. Empty when the activity has no position data. */
  route: { lat: number[]; lon: number[] } & Partial<Record<SeriesKey, number[]>>;
  /** Evenly resampled, smoothed series for charts. Index is progress through the activity. */
  series: Partial<Record<SeriesKey, number[]>>;
  splits: { km: Split[]; mi: Split[] };
}

export type MetricId =
  | 'distance' | 'movingTime' | 'elapsedTime' | 'pace' | 'speed' | 'maxSpeed'
  | 'elevGain' | 'elevLoss' | 'maxEle' | 'avgHr' | 'maxHr'
  | 'avgPower' | 'maxPower' | 'normPower' | 'avgCadence' | 'calories' | 'avgTemp';

export type Rect = [x: number, y: number, w: number, h: number];
export type Aspect = '9:16' | '4:5' | '1:1' | '16:9' | 'photo';
export type StatsVariant = 'row' | 'column' | 'grid' | 'hero' | 'stack';
export type Align = 'left' | 'center' | 'right';
export type RouteColorBy = 'solid' | 'progress' | SeriesKey;
export type BackgroundKind = 'solid' | 'gradient' | 'pattern' | 'photo' | 'transparent';
export type PatternKind = 'contours' | 'ridges' | 'dots' | 'grain';

export interface Background {
  kind: BackgroundKind;
  color: string;
  color2: string;
  angle: number;
  gradient: 'linear' | 'glow';
  pattern: PatternKind;
  zoom: number; // 1 = cover
  panX: number; // -1..1
  panY: number;
  dim: number; // 0..0.85
  blur: number; // 0..1
  mono: boolean;
}

export interface LayerOverride {
  rect?: Rect;
  hidden?: boolean;
}

export interface Design {
  templateId: string;
  aspect: Aspect;
  ink: string;
  accent: string;
  paper: string; // the mat colour on templates with a frame
  font: string | null; // null = the template's own type
  fontWeight: number | null; // null = each font's own default
  background: Background;
  metrics: MetricId[] | null; // null = sensible defaults for the sport
  statsVariant: StatsVariant | 'auto';
  statsAlign: Align | 'auto';
  chartSeries: SeriesKey | 'auto';
  route: { width: number; colorBy: RouteColorBy; rotate: number; markers: boolean; glow: boolean };
  title: string | null; // null = the activity name
  subtitle: string | null; // null = date and sport
  caption: string;
  layout: Record<string, LayerOverride>; // `${template}:${aspect}:${layerId}`
}
