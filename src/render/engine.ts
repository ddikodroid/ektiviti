import type { Activity, Aspect, Design, MetricId, Rect, SeriesKey, Split, Units } from '../types';
import { defaultMetrics, distanceIn, formatDate, formatPace, metricValue, speedIn, SPORT_LABEL, type MetricValue } from '../lib/format';
import { drawBackground } from './background';
import { FONT_CHOICES, supportsWeight, type FontSpec } from './fonts';
import { templateById, type LayerOpts, type LayerType, type Shape, type TypeSet } from './templates';

type Ctx = CanvasRenderingContext2D;

export interface Scene {
  activity: Activity;
  design: Design;
  units: Units;
  photo: ImageBitmap | null;
  /** Export only: leave out the background so the overlay can sit on anything. */
  overlayOnly?: boolean;
  /** Colour painted under everything, for formats with no transparency. */
  matte?: string;
}

export interface Layer {
  id: string;
  type: LayerType;
  rect: Rect;
  opts: LayerOpts;
  hidden: boolean;
  editable: boolean; // false for frames and rules, which stay put
}

export const LAYER_NAMES: Record<string, string> = {
  route: 'Route map', stats: 'Stats', title: 'Title', chart: 'Chart', splits: 'Splits', caption: 'Note',
};

const SIZES: Record<Exclude<Aspect, 'photo'>, [number, number]> = {
  '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080],
};

export function sceneSize(aspect: Aspect, photo: ImageBitmap | null): [number, number] {
  if (aspect !== 'photo') return SIZES[aspect];
  if (!photo) return SIZES['4:5'];
  const r = photo.width / photo.height;
  return r >= 1 ? [Math.round(1080 * r), 1080] : [1080, Math.round(1080 / r)];
}

// Instagram covers the top and bottom of a story, so 9:16 layouts live inside this band.
const STORY_TOP = 0.11;
const STORY_SPAN = 0.74;

const toStory = (r: Rect): Rect => [r[0], STORY_TOP + r[1] * STORY_SPAN, r[2], r[3] * STORY_SPAN];
export const layerKey = (d: Design, id: string) => `${d.templateId}:${d.aspect}:${id}`;

export function resolveLayers(activity: Activity, design: Design, size: [number, number]): Layer[] {
  const story = design.aspect === '9:16';
  const ratio = (size[0] / size[1]) / (story ? STORY_SPAN : 1);
  const shape: Shape = ratio < 0.9 ? 'tall' : ratio <= 1.25 ? 'square' : 'wide';
  const specs = templateById(design.templateId).layout(shape);
  const all = [...specs, { id: 'caption', type: 'caption' as const, rect: [0.08, 0.945, 0.84, 0.03] as Rect, bleed: false, opts: {} }];

  const usable = (type: LayerType) => {
    if (type === 'route') return activity.route.lat.length > 1;
    if (type === 'chart') return Object.keys(activity.series).length > 0;
    if (type === 'splits') return activity.splits.km.length > 0;
    if (type === 'caption') return design.caption.trim().length > 0;
    return true;
  };

  return all.filter((s) => usable(s.type)).map((s) => {
    const o = design.layout[layerKey(design, s.id)];
    const opts = { ...s.opts };
    const mapped = story && !s.bleed;
    if (s.type === 'mat' && opts.hole && story) opts.hole = toStory(opts.hole);
    const fixed = s.type === 'mat' || s.type === 'film' || s.type === 'rule';
    const base = mapped && s.type !== 'mat' ? toStory(s.rect) : s.rect;
    return { id: s.id, type: s.type, opts, rect: o?.rect ?? base, hidden: !!o?.hidden, editable: !fixed };
  });
}

export function resolveMetrics(a: Activity, d: Design, units: Units): MetricValue[] {
  const ids: MetricId[] = d.metrics ?? defaultMetrics(a.sport);
  return ids.flatMap((id) => metricValue(id, a, units) ?? []);
}

export function resolveType(d: Design): TypeSet {
  const base = templateById(d.templateId).type;
  const choice = FONT_CHOICES.find((f) => f.id === d.font);
  const t = choice ? { ...base, display: choice.spec, number: choice.spec } : base;
  const w = d.fontWeight;
  if (w === null) return t;
  // Labels keep their weight. Only fonts that ship the chosen weight change.
  const weigh = (f: FontSpec) => (supportsWeight(f, w) ? { ...f, weight: w } : f);
  return { ...t, display: weigh(t.display), number: weigh(t.number) };
}

function setFont(c: Ctx, f: FontSpec, size: number) {
  c.font = `${f.weight} ${size}px ${f.stack ?? `"${f.family}", system-ui, sans-serif`}`;
  c.letterSpacing = `${(f.track ?? 0) * size}px`;
}

function withAlpha(hex: string, alpha: number) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex.slice(0, 7)}${a}`;
}

interface Px { x: number; y: number; w: number; h: number }
interface Ctxt { c: Ctx; W: number; H: number; k: number; scene: Scene; type: TypeSet; ink: string; accent: string; halo?: string; pass?: 'halo' | 'fill' }

const UNIT_RATIO = 0.42;

function valueWidth(g: Ctxt, m: MetricValue, size: number) {
  const { c, type } = g;
  setFont(c, type.number, size);
  let w = c.measureText(m.value).width;
  if (m.unit) {
    setFont(c, type.label, size * UNIT_RATIO);
    w += size * 0.12 + c.measureText(m.unit).width;
  }
  return w;
}

function fitValues(g: Ctxt, items: MetricValue[], maxW: number, maxSize: number) {
  let size = maxSize;
  for (const m of items) size = Math.min(size, (maxSize * maxW) / Math.max(1, valueWidth(g, m, maxSize)));
  return size;
}

/**
 * Outlines text in the background colour so it cuts out of the route behind it. Outlined layers draw in
 * two passes, all outlines then all text, so one number's outline never erases a neighbouring label.
 */
function haloText(g: Ctxt, text: string, x: number, y: number, size: number) {
  if (g.pass === 'halo') {
    g.c.strokeStyle = g.halo!;
    g.c.lineWidth = size * 0.22;
    g.c.lineJoin = 'round';
    g.c.strokeText(text, x, y);
  } else {
    g.c.fillText(text, x, y);
  }
}

function drawValue(g: Ctxt, m: MetricValue, x: number, baseline: number, size: number, align: LayerOpts['align']) {
  const { c, type } = g;
  const w = valueWidth(g, m, size);
  let at = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = g.ink;
  setFont(c, type.number, size);
  haloText(g, m.value, at, baseline, size);
  if (m.unit) {
    at += c.measureText(m.value).width + size * 0.12;
    setFont(c, type.label, size * UNIT_RATIO);
    c.fillStyle = withAlpha(g.ink, 0.72);
    haloText(g, m.unit, at, baseline, size * UNIT_RATIO * 1.6);
  }
}

function drawLabel(g: Ctxt, text: string, x: number, baseline: number, size: number, align: LayerOpts['align']) {
  const { c, type } = g;
  setFont(c, type.label, size);
  c.textAlign = align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = withAlpha(g.ink, 0.72);
  haloText(g, type.upper ? text.toUpperCase() : text, x, baseline, size * 1.6);
}

function statGrid(g: Ctxt, items: MetricValue[], p: Px, cols: number, align: LayerOpts['align']) {
  const rows = Math.ceil(items.length / cols);
  const gapX = p.w * 0.035;
  const cellW = (p.w - gapX * (cols - 1)) / cols;
  const cellH = p.h / rows;
  const size = fitValues(g, items, cellW, cellH * 0.6);
  const labelSize = Math.min(Math.max(19, size * 0.3), 30, cellH * 0.24);
  const block = labelSize * 1.45 + size * 0.86;
  items.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = p.x + col * (cellW + gapX);
    const x = align === 'center' ? left + cellW / 2 : align === 'right' ? left + cellW : left;
    const top = p.y + row * cellH + (cellH - block) / 2;
    drawLabel(g, m.label, x, top + labelSize, labelSize, align);
    drawValue(g, m, x, top + block, size, align);
  });
}

/** One metric per row, top to bottom, label above value. Every value shares one size. */
function statStack(g: Ctxt, items: MetricValue[], p: Px, align: LayerOpts['align']) {
  const rowH = p.h / items.length;
  const size = fitValues(g, items, p.w, rowH * 0.62);
  const labelSize = Math.min(Math.max(19, size * 0.24), 32, rowH * 0.2);
  const block = labelSize * 1.45 + size * 0.86;
  const x = align === 'center' ? p.x + p.w / 2 : align === 'right' ? p.x + p.w : p.x;
  items.forEach((m, i) => {
    const top = p.y + rowH * i + (rowH - block) / 2;
    drawLabel(g, m.label, x, top + labelSize, labelSize, align);
    drawValue(g, m, x, top + block, size, align);
  });
}

function statColumn(g: Ctxt, items: MetricValue[], p: Px, rules: boolean) {
  const rowH = p.h / items.length;
  const size = fitValues(g, items, p.w * 0.62, rowH * 0.66);
  const labelSize = Math.max(17, Math.min(rowH * 0.24, p.w * 0.05, 34));
  items.forEach((m, i) => {
    const mid = p.y + rowH * (i + 0.5);
    if (rules && i > 0) {
      g.c.fillStyle = withAlpha(g.ink, 0.28);
      g.c.fillRect(p.x, p.y + rowH * i, p.w, 2);
    }
    drawLabel(g, m.label, p.x, mid + labelSize * 0.35, labelSize, 'left');
    drawValue(g, m, p.x + p.w, mid + size * 0.36, size, 'right');
  });
}

function drawStats(g: Ctxt, l: Layer, p: Px) {
  const { activity, design, units } = g.scene;
  let items = resolveMetrics(activity, design, units);
  if (!items.length) return;
  const variant = design.statsVariant === 'auto' ? l.opts.variant ?? 'row' : design.statsVariant;
  // "max" is how a template keeps its proportions. Choosing a layout by hand lifts it.
  if (l.opts.max && design.statsVariant === 'auto' && design.metrics === null) items = items.slice(0, l.opts.max);
  const align = design.statsAlign === 'auto' ? l.opts.align ?? 'left' : design.statsAlign;

  if (variant === 'column') return statColumn(g, items, p, l.opts.rules ?? true);
  if (variant === 'stack') return statStack(g, items, p, align);
  if (variant === 'grid') return statGrid(g, items, p, items.length > 1 ? 2 : 1, align);
  if (variant === 'row') {
    const cols = items.length <= 4 ? items.length : Math.ceil(items.length / 2);
    return statGrid(g, items, p, cols, align);
  }
  const [hero, ...rest] = items;
  const heroH = rest.length ? p.h * 0.68 : p.h;
  const labelSize = Math.max(14, Math.min(heroH * 0.1, 34));
  const size = fitValues(g, [hero], p.w, (heroH - labelSize * 1.6) * 1.08);
  const x = align === 'center' ? p.x + p.w / 2 : align === 'right' ? p.x + p.w : p.x;
  drawLabel(g, hero.label, x, p.y + labelSize, labelSize, align);
  drawValue(g, hero, x, p.y + labelSize * 1.5 + size * 0.84, size, align);
  if (rest.length) {
    statGrid(g, rest, { x: p.x, y: p.y + heroH, w: p.w, h: p.h - heroH }, rest.length <= 3 ? rest.length : Math.ceil(rest.length / 2), align);
  }
}

function wrap(c: Ctx, text: string, maxW: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width <= maxW) line = next;
    else {
      if (line) lines.push(line);
      line = w;
      if (c.measureText(w).width > maxW) return null;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

function drawTitle(g: Ctxt, l: Layer, p: Px) {
  const { c, type, scene } = g;
  const { activity: a, design: d } = scene;
  const text = d.title ?? a.name;
  const sub = d.subtitle ?? `${formatDate(a.start)} · ${SPORT_LABEL[a.sport]}`;
  const align = l.opts.align ?? 'left';
  const x = align === 'center' ? p.x + p.w / 2 : align === 'right' ? p.x + p.w : p.x;
  const subSize = sub ? Math.max(14, Math.min(p.h * 0.17, 32)) : 0;
  const room = p.h - subSize * 1.7;
  let size = room * 0.82;
  let lines: string[] | null = null;
  while (size > 12) {
    setFont(c, type.display, size);
    lines = wrap(c, text, p.w, 2);
    if (lines && lines.length * size * 1.08 <= room) break;
    size *= 0.94;
  }
  lines ??= [text];
  setFont(c, type.display, size);
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = g.ink;
  lines.forEach((t, i) => c.fillText(t, x, p.y + size * 0.92 + i * size * 1.08));
  if (sub) drawLabel(g, sub, x, p.y + lines.length * size * 1.08 + subSize * 1.35, subSize, align);
}

function pickSeries(g: Ctxt, l: Layer): SeriesKey | null {
  const { series } = g.scene.activity;
  const want = g.scene.design.chartSeries === 'auto' ? l.opts.series : g.scene.design.chartSeries;
  if (want && series[want]) return want;
  return (['ele', 'hr', 'speed', 'power', 'cad'] as SeriesKey[]).find((k) => series[k]) ?? null;
}

export const SERIES_LABEL: Record<SeriesKey, string> = { ele: 'Elevation', speed: 'Speed', hr: 'Heart rate', power: 'Power', cad: 'Cadence' };

function drawChart(g: Ctxt, l: Layer, p: Px) {
  const key = pickSeries(g, l);
  if (!key) return;
  const { c } = g;
  const xs = g.scene.activity.series[key]!;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo || 1;
  const style = l.opts.chart ?? 'area';
  const norm = (v: number) => (v - lo) / span;

  if (style === 'ribbon') {
    const bars = 96;
    const barW = p.w / bars;
    c.fillStyle = g.accent;
    for (let i = 0; i < bars; i++) {
      const v = norm(xs[Math.floor((i / bars) * xs.length)]);
      const h = Math.max(4, p.h * (0.1 + v * 0.88));
      c.fillRect(p.x + i * barW + barW * 0.2, p.y + (p.h - h) / 2, barW * 0.6, h);
    }
  } else {
    const top = p.y + p.h * 0.08;
    const usable = p.h * (style === 'area' ? 0.72 : 0.9);
    const yAt = (v: number) => top + usable * (1 - norm(v));
    c.beginPath();
    xs.forEach((v, i) => {
      const x = p.x + (p.w * i) / (xs.length - 1);
      if (i === 0) c.moveTo(x, yAt(v));
      else c.lineTo(x, yAt(v));
    });
    if (style === 'area') {
      const line = new Path2D();
      xs.forEach((v, i) => line.lineTo(p.x + (p.w * i) / (xs.length - 1), yAt(v)));
      c.lineTo(p.x + p.w, p.y + p.h);
      c.lineTo(p.x, p.y + p.h);
      c.closePath();
      const fill = c.createLinearGradient(0, p.y, 0, p.y + p.h);
      fill.addColorStop(0, withAlpha(g.accent, 0.55));
      fill.addColorStop(1, withAlpha(g.accent, 0.08));
      c.fillStyle = fill;
      c.fill();
      c.strokeStyle = g.accent;
      c.lineWidth = 4;
      c.lineJoin = 'round';
      c.stroke(line);
    } else {
      c.strokeStyle = g.accent;
      c.lineWidth = 3;
      c.lineJoin = 'round';
      c.stroke();
    }
  }
  if (l.opts.labels) {
    const size = Math.max(14, Math.min(p.h * 0.06, 24));
    drawLabel(g, SERIES_LABEL[key], p.x + p.w * 0.08, p.y - size * 0.5, size, 'left');
  }
}

function groupSplits(splits: Split[], maxRows: number) {
  const per = Math.ceil(splits.length / maxRows);
  const out: { label: string; distance: number; time: number }[] = [];
  for (let i = 0; i < splits.length; i += per) {
    const part = splits.slice(i, i + per);
    const label = per === 1 ? `${i + 1}` : `${i + 1}–${i + part.length}`;
    out.push({ label, distance: part.reduce((s, x) => s + x.distance, 0), time: part.reduce((s, x) => s + x.time, 0) });
  }
  return out;
}

function drawSplits(g: Ctxt, p: Px) {
  const { c, scene } = g;
  const { activity: a, units } = scene;
  const raw = units === 'metric' ? a.splits.km : a.splits.mi;
  const rows = groupSplits(raw, Math.max(4, Math.min(12, Math.floor(p.h / 50))));
  const showSpeed = a.sport === 'ride';
  const rate = rows.map((r) => (r.time > 0 ? r.distance / r.time : 0));
  const hi = Math.max(...rate);
  const lo = Math.min(...rate.filter((v) => v > 0));
  const unit = units === 'metric' ? 'km' : 'mi';
  const header = Math.max(16, Math.min(p.h * 0.045, 26));
  drawLabel(g, `Splits / ${unit}`, p.x, p.y + header, header, 'left');
  drawLabel(g, showSpeed ? (units === 'metric' ? 'km/h' : 'mph') : `Pace /${unit}`, p.x + p.w, p.y + header, header, 'right');
  const top = p.y + header * 1.8;
  const rowH = (p.h - header * 1.8) / rows.length;
  const size = Math.min(rowH * 0.7, 42);
  const labelW = p.w * 0.13;
  const valueW = p.w * 0.17;
  const barMax = p.w - labelW - valueW;
  rows.forEach((r, i) => {
    const y = top + rowH * i;
    const mid = y + rowH / 2;
    const v = rate[i];
    const t = hi > lo ? (v - lo) / (hi - lo) : 1;
    const best = v === hi;
    c.fillStyle = best ? g.accent : withAlpha(g.ink, 0.22);
    c.fillRect(p.x + labelW, y + rowH * 0.16, barMax * (0.35 + 0.65 * t), rowH * 0.68);
    setFont(c, g.type.number, size);
    c.textBaseline = 'middle';
    c.fillStyle = g.ink;
    c.textAlign = 'left';
    c.fillText(r.label, p.x, mid);
    c.textAlign = 'right';
    const shown = showSpeed
      ? speedIn(v, units).toFixed(1)
      : v > 0 ? formatPace(r.time / distanceIn(r.distance, units)) : '–';
    c.fillText(shown, p.x + p.w, mid);
  });
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawRoute(g: Ctxt, p: Px) {
  const { c, k, scene } = g;
  const { route } = scene.activity;
  const opts = scene.design.route;
  const n = route.lat.length;
  const rad = Math.PI / 180;
  const midLat = (Math.min(...route.lat) + Math.max(...route.lat)) / 2;
  const cosLat = Math.cos(midLat * rad);
  const rot = opts.rotate * rad;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const px = route.lon[i] * cosLat;
    const py = -route.lat[i];
    const x = px * Math.cos(rot) - py * Math.sin(rot);
    const y = px * Math.sin(rot) + py * Math.cos(rot);
    xs[i] = x;
    ys[i] = y;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const width = Math.max(2.5, Math.min(p.w, p.h) * 0.011) * opts.width;
  const pad = width * 2.5;
  const scale = Math.min((p.w - pad * 2) / (maxX - minX || 1e-9), (p.h - pad * 2) / (maxY - minY || 1e-9));
  const ox = p.x + (p.w - (maxX - minX) * scale) / 2;
  const oy = p.y + (p.h - (maxY - minY) * scale) / 2;
  const X = (i: number) => ox + (xs[i] - minX) * scale;
  const Y = (i: number) => oy + (ys[i] - minY) * scale;

  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = width;
  if (opts.glow) {
    c.shadowColor = g.accent;
    c.shadowBlur = width * 3.5 * k;
  }

  const col = opts.colorBy === 'solid' || opts.colorBy === 'progress' ? null : route[opts.colorBy];
  if (opts.colorBy === 'solid' || (opts.colorBy !== 'progress' && !col)) {
    c.strokeStyle = g.accent;
    c.beginPath();
    c.moveTo(X(0), Y(0));
    for (let i = 1; i < n; i++) c.lineTo(X(i), Y(i));
    c.stroke();
  } else {
    // Percentile bounds stop one GPS spike from flattening the colour range.
    let t = (i: number) => i / (n - 1);
    if (col) {
      const sorted = col.filter(Number.isFinite).sort((a, b) => a - b);
      const lo = sorted[Math.floor(sorted.length * 0.03)];
      const hi = sorted[Math.floor(sorted.length * 0.97)];
      t = (i) => (Number.isFinite(col[i]) ? Math.max(0, Math.min(1, (col[i] - lo) / (hi - lo || 1))) : 0);
    }
    const from = g.accent.toLowerCase() === g.ink.toLowerCase() ? '#808080' : g.ink;
    for (let i = 1; i < n; i++) {
      c.strokeStyle = mix(from, g.accent, t(i));
      c.beginPath();
      c.moveTo(X(i - 1), Y(i - 1));
      c.lineTo(X(i), Y(i));
      c.stroke();
    }
  }
  c.shadowBlur = 0;
  c.shadowColor = 'transparent';

  if (opts.markers) {
    const r = width * 1.5;
    c.lineWidth = width * 0.7;
    c.strokeStyle = g.ink;
    c.beginPath();
    c.arc(X(0), Y(0), r, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = g.ink;
    c.beginPath();
    c.arc(X(n - 1), Y(n - 1), r * 0.8, 0, Math.PI * 2);
    c.fill();
  }
}

function drawFilm(g: Ctxt) {
  const { c, W, H, scene } = g;
  const vertical = H >= W;
  const size = Math.min(W, H);
  const band = size * 0.1;
  const holeW = band * 0.42;
  const holeH = band * 0.3;
  const step = band * 0.62;
  const edge = vertical ? H : W;
  c.fillStyle = '#000000';
  if (vertical) { c.fillRect(0, 0, band, H); c.fillRect(W - band, 0, band, H); }
  else { c.fillRect(0, 0, W, band); c.fillRect(0, H - band, W, band); }
  c.fillStyle = withAlpha(g.ink, 0.85);
  for (let at = step / 2; at < edge - holeH; at += step) {
    for (const side of [0, 1]) {
      const inset = (band - holeW) / 2;
      const across = side ? (vertical ? W : H) - band + inset : inset;
      c.beginPath();
      if (vertical) c.roundRect(across, at, holeW, holeH, holeH * 0.22);
      else c.roundRect(at, across, holeH, holeW, holeH * 0.22);
      c.fill();
    }
  }
  const d = new Date(scene.activity.start);
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}  ${SPORT_LABEL[scene.activity.sport].toUpperCase()}`;
  c.save();
  if (vertical) { c.translate(band * 1.25, H * 0.97); c.rotate(-Math.PI / 2); }
  else c.translate(W * 0.05, band * 1.35);
  setFont(c, g.type.label, band * 0.2);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = g.accent;
  c.fillText(stamp, 0, 0);
  c.restore();
}

function haloColour(d: Design): string | undefined {
  const bg = d.background;
  if (bg.kind === 'transparent') return undefined;
  if (bg.kind === 'photo') return 'rgba(0,0,0,0.55)';
  return bg.color;
}

export function renderScene(c: Ctx, scene: Scene, k: number) {
  const { activity, design, photo } = scene;
  const size = sceneSize(design.aspect, photo);
  const [W, H] = size;
  c.setTransform(k, 0, 0, k, 0, 0);
  c.clearRect(0, 0, W, H);
  if (scene.matte) {
    c.fillStyle = scene.matte;
    c.fillRect(0, 0, W, H);
  }
  if (!scene.overlayOnly) drawBackground(c, W, H, k, design.background, design.accent, activity, photo);
  const g: Ctxt = { c, W, H, k, scene, type: resolveType(design), ink: design.ink, accent: design.accent };
  for (const l of resolveLayers(activity, design, size)) {
    if (l.hidden) continue;
    const p: Px = { x: l.rect[0] * W, y: l.rect[1] * H, w: l.rect[2] * W, h: l.rect[3] * H };
    switch (l.type) {
      case 'mat': {
        const [hx, hy, hw, hh] = l.opts.hole!;
        const path = new Path2D();
        path.rect(0, 0, W, H);
        path.rect(hx * W, hy * H, hw * W, hh * H);
        c.fillStyle = design.paper;
        c.fill(path, 'evenodd');
        break;
      }
      case 'film': drawFilm(g); break;
      case 'rule': c.fillStyle = withAlpha(g.ink, 0.5); c.fillRect(p.x, p.y, p.w, 2); break;
      case 'route': drawRoute(g, p); break;
      case 'stats': {
        const halo = l.opts.halo ? haloColour(design) : undefined;
        if (halo) drawStats({ ...g, halo, pass: 'halo' }, l, p);
        drawStats(g, l, p);
        break;
      }
      case 'title': drawTitle(g, l, p); break;
      case 'chart': drawChart(g, l, p); break;
      case 'splits': drawSplits(g, p); break;
      case 'caption': {
        const s = Math.min(p.h * 0.8, 34);
        setFont(c, g.type.label, s);
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillStyle = g.ink;
        c.fillText(design.caption, p.x, p.y + p.h / 2, p.w);
        break;
      }
    }
  }
}

export interface ExportOptions { format: 'png' | 'jpeg' | 'overlay'; scale: 1 | 2 }

export async function exportBlob(scene: Scene, o: ExportOptions): Promise<Blob> {
  const [W, H] = sceneSize(scene.design.aspect, scene.photo);
  const canvas = document.createElement('canvas');
  canvas.width = W * o.scale;
  canvas.height = H * o.scale;
  const c = canvas.getContext('2d')!;
  const overlayOnly = o.format === 'overlay';
  // JPEG has no alpha, so transparent areas need a defined colour.
  const matte = o.format === 'jpeg' ? scene.design.background.color : undefined;
  renderScene(c, { ...scene, overlayOnly, matte }, o.scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not create the image.'))),
      o.format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.93));
}
