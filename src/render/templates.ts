import type { Background, Design, Rect, RouteColorBy, SeriesKey, StatsVariant } from '../types';
import type { FontSpec } from './fonts';

export type Shape = 'tall' | 'square' | 'wide';
export type LayerType = 'route' | 'stats' | 'title' | 'chart' | 'splits' | 'caption' | 'rule' | 'film' | 'mat';

export interface LayerOpts {
  variant?: StatsVariant;
  align?: 'left' | 'center' | 'right';
  rules?: boolean;
  series?: SeriesKey;
  chart?: 'area' | 'line' | 'ribbon';
  labels?: boolean;
  hole?: Rect;
  max?: number;
}

export interface LayerSpec { id: string; type: LayerType; rect: Rect; bleed?: boolean; opts?: LayerOpts }

export interface TypeSet { display: FontSpec; number: FontSpec; label: FontSpec; upper: boolean }

export interface Template {
  id: string;
  name: string;
  collection: string;
  type: TypeSet;
  ink: string;
  accent: string;
  paper?: string;
  background: Partial<Background>;
  route?: Partial<Design['route']>;
  layout: (shape: Shape) => LayerSpec[];
}

const sans: FontSpec = { family: 'IBM Plex Sans', weight: 500, track: 0.08 };
const mono: FontSpec = { family: 'IBM Plex Mono', weight: 400, track: 0.06 };
const serif: FontSpec = { family: 'Instrument Serif', weight: 400 };
const grotesk: FontSpec = { family: 'Bricolage Grotesque', weight: 700, track: -0.015 };
const barlow: FontSpec = { family: 'Barlow Condensed', weight: 600 };
const anton: FontSpec = { family: 'Anton', weight: 400 };

const route = (rect: Rect, bleed?: boolean): LayerSpec => ({ id: 'route', type: 'route', rect, bleed });
const title = (rect: Rect, align: LayerOpts['align'] = 'left'): LayerSpec => ({ id: 'title', type: 'title', rect, opts: { align } });
const stats = (rect: Rect, variant: StatsVariant, opts: LayerOpts = {}): LayerSpec => ({ id: 'stats', type: 'stats', rect, opts: { variant, ...opts } });
const chart = (rect: Rect, opts: LayerOpts = {}, bleed?: boolean): LayerSpec => ({ id: 'chart', type: 'chart', rect, bleed, opts });
const rule = (id: string, x: number, y: number, w: number): LayerSpec => ({ id, type: 'rule', rect: [x, y, w, 0.002] });

export const TEMPLATES: Template[] = [
  {
    id: 'meridian', name: 'Meridian', collection: 'Quiet',
    type: { display: grotesk, number: grotesk, label: sans, upper: true },
    ink: '#f1ede4', accent: '#f1ede4', background: { kind: 'solid', color: '#14171a' },
    layout: (s) => s === 'wide'
      ? [route([0.05, 0.1, 0.48, 0.8]), title([0.58, 0.13, 0.37, 0.22]), stats([0.58, 0.42, 0.37, 0.45], 'grid', { align: 'left' })]
      : s === 'square'
        ? [title([0.08, 0.06, 0.84, 0.13], 'center'), route([0.2, 0.21, 0.6, 0.54]), stats([0.08, 0.79, 0.84, 0.15], 'row', { align: 'center', max: 4 })]
        : [title([0.08, 0.06, 0.84, 0.12], 'center'), route([0.12, 0.2, 0.76, 0.54]), stats([0.08, 0.78, 0.84, 0.16], 'row', { align: 'center', max: 4 })],
  },
  {
    id: 'ledger', name: 'Ledger', collection: 'Quiet',
    type: { display: serif, number: barlow, label: sans, upper: true },
    ink: '#e9e4d8', accent: '#d9a441', background: { kind: 'solid', color: '#1a1c17' },
    layout: (s) => s === 'wide'
      ? [title([0.05, 0.1, 0.4, 0.26]), route([0.05, 0.42, 0.34, 0.48]), stats([0.5, 0.1, 0.45, 0.8], 'column', { rules: true })]
      : [title([0.08, 0.07, 0.56, 0.17]), route([0.68, 0.06, 0.24, 0.2]), stats([0.08, 0.3, 0.84, 0.63], 'column', { rules: true })],
  },
  {
    id: 'footnote', name: 'Footnote', collection: 'Quiet',
    type: { display: grotesk, number: grotesk, label: sans, upper: true },
    ink: '#ffffff', accent: '#ffffff',
    background: { kind: 'gradient', color: '#27424a', color2: '#b07b52', angle: 160, gradient: 'linear' },
    layout: (s) => s === 'wide'
      ? [route([0.83, 0.6, 0.12, 0.32]), title([0.04, 0.68, 0.55, 0.11]), stats([0.04, 0.8, 0.55, 0.13], 'row', { max: 3 })]
      : [route([0.72, 0.68, 0.2, 0.17]), title([0.07, 0.73, 0.6, 0.09]), stats([0.07, 0.84, 0.86, 0.1], 'row', { max: 3 })],
  },
  {
    id: 'broadsheet', name: 'Broadsheet', collection: 'Print',
    type: { display: serif, number: serif, label: sans, upper: true },
    ink: '#191612', accent: '#b3301f', background: { kind: 'solid', color: '#efe8da' },
    layout: (s) => s === 'wide'
      ? [rule('r1', 0.04, 0.07, 0.42), title([0.04, 0.1, 0.42, 0.36]), rule('r2', 0.04, 0.5, 0.42), stats([0.04, 0.53, 0.42, 0.39], 'grid'), route([0.5, 0.07, 0.46, 0.86])]
      : [rule('r1', 0.07, 0.05, 0.86), title([0.07, 0.07, 0.86, 0.2]), rule('r2', 0.07, 0.285, 0.86), route([0.07, 0.31, 0.86, 0.44]), rule('r3', 0.07, 0.775, 0.86), stats([0.07, 0.795, 0.86, 0.15], 'row', { max: 4 })],
  },
  {
    id: 'gallery', name: 'Gallery Mat', collection: 'Print',
    type: { display: serif, number: { ...sans, weight: 500, track: 0 }, label: sans, upper: true },
    ink: '#1c1a17', accent: '#1c1a17', paper: '#f5f2ea',
    background: { kind: 'pattern', pattern: 'contours', color: '#26352f', color2: '#26352f' },
    layout: (s) => {
      const mat = (hole: Rect): LayerSpec => ({ id: 'mat', type: 'mat', rect: [0, 0, 1, 1], opts: { hole } });
      return s === 'wide'
        ? [mat([0.04, 0.07, 0.62, 0.86]), title([0.7, 0.08, 0.26, 0.3]), stats([0.7, 0.42, 0.26, 0.28], 'column', { max: 4 }), route([0.7, 0.74, 0.14, 0.19])]
        : [mat([0.07, 0.05, 0.86, 0.69]), title([0.07, 0.77, 0.58, 0.1]), stats([0.07, 0.875, 0.58, 0.075], 'row', { max: 3 }), route([0.71, 0.77, 0.22, 0.18])];
    },
  },
  {
    id: 'contact', name: 'Contact Strip', collection: 'Print',
    type: { display: { ...mono, weight: 500, track: 0 }, number: { ...mono, weight: 500, track: -0.02 }, label: mono, upper: true },
    ink: '#f0e7d3', accent: '#ff9b3d', background: { kind: 'solid', color: '#0e0d0c' },
    layout: (s) => s === 'wide'
      ? [{ id: 'film', type: 'film', rect: [0, 0, 1, 1], bleed: true }, route([0.05, 0.17, 0.4, 0.66]), title([0.5, 0.17, 0.45, 0.14]), stats([0.5, 0.34, 0.45, 0.3], 'grid'), chart([0.5, 0.67, 0.45, 0.16], { chart: 'line' })]
      : [{ id: 'film', type: 'film', rect: [0, 0, 1, 1], bleed: true }, title([0.15, 0.04, 0.7, 0.1]), route([0.15, 0.16, 0.7, 0.4]), chart([0.15, 0.58, 0.7, 0.12], { chart: 'line' }), stats([0.15, 0.73, 0.7, 0.22], 'grid')],
  },
  {
    id: 'profile', name: 'Profile', collection: 'Signal',
    type: { display: grotesk, number: barlow, label: sans, upper: true },
    ink: '#f4f6f2', accent: '#5fd3a6', background: { kind: 'gradient', color: '#0d2b2a', color2: '#071413', angle: 180, gradient: 'linear' },
    layout: (s) => s === 'wide'
      ? [title([0.05, 0.08, 0.5, 0.2]), stats([0.05, 0.3, 0.9, 0.26], 'row', { max: 4 }), chart([0, 0.6, 1, 0.4], { series: 'ele', chart: 'area' }, true)]
      : [title([0.08, 0.06, 0.84, 0.13]), stats([0.08, 0.21, 0.84, 0.34], 'hero', { max: 4 }), chart([0, 0.62, 1, 0.38], { series: 'ele', chart: 'area' }, true)],
  },
  {
    id: 'ridgeline', name: 'Ridgeline', collection: 'Signal',
    type: { display: serif, number: serif, label: sans, upper: true },
    ink: '#f6efe2', accent: '#f6efe2',
    background: { kind: 'pattern', pattern: 'ridges', color: '#1c1b3a', color2: '#1c1b3a' },
    layout: (s) => s === 'wide'
      ? [title([0.05, 0.08, 0.6, 0.22]), stats([0.05, 0.74, 0.9, 0.2], 'row', { max: 4 })]
      : [title([0.08, 0.06, 0.84, 0.15], 'center'), stats([0.08, 0.8, 0.84, 0.15], 'row', { align: 'center', max: 4 })],
  },
  {
    id: 'pulse', name: 'Pulse', collection: 'Signal',
    type: { display: barlow, number: barlow, label: sans, upper: true },
    ink: '#fff4f0', accent: '#ff4b3e', background: { kind: 'solid', color: '#160a0c' },
    layout: (s) => s === 'wide'
      ? [title([0.05, 0.08, 0.6, 0.18]), route([0.78, 0.07, 0.17, 0.26]), chart([0, 0.36, 1, 0.32], { series: 'hr', chart: 'ribbon', labels: true }, true), stats([0.05, 0.74, 0.9, 0.2], 'row', { max: 4 })]
      : [title([0.08, 0.06, 0.6, 0.15]), route([0.72, 0.06, 0.2, 0.16]), chart([0, 0.3, 1, 0.34], { series: 'hr', chart: 'ribbon', labels: true }, true), stats([0.08, 0.71, 0.84, 0.23], 'grid')],
  },
  {
    id: 'splitsheet', name: 'Split Sheet', collection: 'Signal',
    type: { display: grotesk, number: barlow, label: sans, upper: true },
    ink: '#14161a', accent: '#2457ff', background: { kind: 'solid', color: '#eceef0' },
    layout: (s) => s === 'wide'
      ? [title([0.05, 0.09, 0.38, 0.22]), stats([0.05, 0.36, 0.38, 0.55], 'hero', { max: 3 }), { id: 'splits', type: 'splits', rect: [0.48, 0.09, 0.47, 0.82] }]
      : [title([0.08, 0.05, 0.84, 0.12]), stats([0.08, 0.18, 0.84, 0.24], 'hero', { max: 3 }), { id: 'splits', type: 'splits', rect: [0.08, 0.45, 0.84, 0.5] }],
  },
  {
    id: 'headline', name: 'Headline', collection: 'Loud',
    type: { display: anton, number: anton, label: { ...barlow, track: 0.05 }, upper: true },
    ink: '#0f1108', accent: '#0f1108', background: { kind: 'solid', color: '#d9f53b' },
    layout: (s) => s === 'wide'
      ? [stats([0.04, 0.07, 0.6, 0.86], 'hero', { max: 3 }), route([0.68, 0.08, 0.28, 0.6]), title([0.68, 0.72, 0.28, 0.2])]
      : [title([0.06, 0.05, 0.88, 0.11]), stats([0.06, 0.17, 0.88, 0.45], 'hero', { max: 3 }), route([0.2, 0.65, 0.6, 0.3])],
  },
  {
    id: 'trace', name: 'Trace', collection: 'Loud',
    type: { display: barlow, number: barlow, label: sans, upper: true },
    ink: '#f8f3ff', accent: '#ff3df0',
    background: { kind: 'gradient', color: '#1b0b45', color2: '#05030f', angle: 200, gradient: 'glow' },
    route: { glow: true, width: 1.3, colorBy: 'progress' },
    layout: (s) => s === 'wide'
      ? [route([0.26, 0.05, 0.7, 0.9]), title([0.04, 0.08, 0.3, 0.2]), stats([0.04, 0.52, 0.22, 0.4], 'column', { max: 4 })]
      : [title([0.07, 0.04, 0.86, 0.11]), route([0.04, 0.16, 0.92, 0.62]), stats([0.07, 0.81, 0.86, 0.14], 'row', { max: 4 })],
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export const DEFAULT_BACKGROUND: Background = {
  kind: 'solid', color: '#14171a', color2: '#2a2f35', angle: 160, gradient: 'linear', pattern: 'contours',
  zoom: 1, panX: 0, panY: 0, dim: 0.25, blur: 0, mono: false,
};
export const DEFAULT_ROUTE: Design['route'] = { width: 1, colorBy: 'solid' as RouteColorBy, rotate: 0, markers: true, glow: false };

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Applies a template's look. A chosen photo stays, and dark ink flips so it reads on top of it. */
export function withTemplate(d: Design, id: string): Design {
  const t = templateById(id);
  const keepPhoto = d.background.kind === 'photo';
  const framed = !!t.paper;
  const ink = keepPhoto && !framed ? '#ffffff' : t.ink;
  const accent = keepPhoto && !framed && luminance(t.accent) < 0.4 ? '#ffffff' : t.accent;
  return {
    ...d,
    templateId: id,
    ink,
    accent,
    paper: t.paper ?? d.paper,
    font: null,
    statsVariant: 'auto',
    chartSeries: 'auto',
    route: { ...DEFAULT_ROUTE, rotate: d.route.rotate, ...t.route },
    background: keepPhoto ? d.background : { ...DEFAULT_BACKGROUND, ...t.background },
  };
}

export function initialDesign(): Design {
  return withTemplate({
    templateId: 'meridian', aspect: '4:5', ink: '#fff', accent: '#fff', paper: '#f5f2ea', font: null,
    background: DEFAULT_BACKGROUND, metrics: null, statsVariant: 'auto', chartSeries: 'auto',
    route: DEFAULT_ROUTE, title: null, subtitle: null, caption: '', layout: {},
  }, 'meridian');
}

export const PALETTES: { name: string; ink: string; accent: string; bg: string }[] = [
  { name: 'Slate', ink: '#f1ede4', accent: '#f1ede4', bg: '#14171a' },
  { name: 'Newsprint', ink: '#191612', accent: '#b3301f', bg: '#efe8da' },
  { name: 'Moss', ink: '#eef0dc', accent: '#c8d65b', bg: '#20291c' },
  { name: 'Ultramarine', ink: '#f2f4ff', accent: '#ffd23f', bg: '#1b2fa8' },
  { name: 'Clay', ink: '#2a1710', accent: '#2a1710', bg: '#e2835a' },
  { name: 'Lime', ink: '#0f1108', accent: '#0f1108', bg: '#d9f53b' },
  { name: 'Ember', ink: '#fff4f0', accent: '#ff4b3e', bg: '#160a0c' },
  { name: 'Ice', ink: '#10222e', accent: '#0a7ea4', bg: '#dcecf2' },
];

export const GRADIENTS: [string, string][] = [
  ['#27424a', '#b07b52'], ['#1b0b45', '#e0307f'], ['#0d2b2a', '#5fd3a6'], ['#ff7a3d', '#7c1d6f'],
  ['#0a1f44', '#3f8efc'], ['#3a1c0f', '#e8b04a'], ['#17181c', '#5a6070'], ['#f6d365', '#fda085'],
];
