import '@fontsource/anton/400.css';
import '@fontsource/barlow-condensed/300.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/bricolage-grotesque/300.css';
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/ibm-plex-mono/300.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/geist-pixel/400.css';
import '@fontsource/geist-mono/300.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import '@fontsource/syne/400.css';
import '@fontsource/syne/600.css';
import '@fontsource/syne/700.css';
import '@fontsource/dancing-script/400.css';
import '@fontsource/dancing-script/600.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/satisfy/400.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/inconsolata/300.css';
import '@fontsource/inconsolata/400.css';
import '@fontsource/inconsolata/600.css';

export interface FontSpec {
  family: string;
  weight: number;
  track?: number;
  /** Full CSS stack, for fonts the device supplies. These can't be bundled, so each needs a fallback. */
  stack?: string;
}

/** Every bundled weight, per family. A weight not listed here falls back to the font's own default. */
export const FAMILY_WEIGHTS: Record<string, number[]> = {
  Anton: [400],
  'Barlow Condensed': [300, 400, 600],
  'Instrument Serif': [400],
  'Bricolage Grotesque': [300, 400, 500, 600, 700],
  'IBM Plex Mono': [300, 400, 500, 600],
  'IBM Plex Sans': [300, 400, 500, 600],
  'Geist Pixel': [400],
  'Geist Mono': [300, 400, 500, 600],
  Syne: [400, 600, 700],
  'Dancing Script': [400, 600, 700],
  Satisfy: [400],
  'Space Mono': [400, 700],
  Inconsolata: [300, 400, 600],
  // Device fonts. Apple ships all three weights of both.
  'SF Pro Display': [300, 400, 600],
  'SF Mono': [300, 400, 600],
};

export const WEIGHT_CHOICES = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Normal' },
  { value: 600, label: 'Semibold' },
];

export const supportsWeight = (f: FontSpec, w: number) => FAMILY_WEIGHTS[f.family]?.includes(w) ?? false;

export type FontGroup = 'Sans' | 'Serif' | 'Mono' | 'Script' | 'Display';

export const FONT_CHOICES: { id: string; label: string; group: FontGroup; spec: FontSpec }[] = [
  { id: 'bricolage', label: 'Bricolage', group: 'Sans', spec: { family: 'Bricolage Grotesque', weight: 700, track: -0.01 } },
  { id: 'syne', label: 'Syne', group: 'Sans', spec: { family: 'Syne', weight: 700, track: -0.01 } },
  { id: 'plex', label: 'Plex Sans', group: 'Sans', spec: { family: 'IBM Plex Sans', weight: 500 } },
  // Apple's licence rules out hosting SF, so these use the copy on the device.
  {
    id: 'sf', label: 'SF Display (Apple devices)', group: 'Sans',
    spec: { family: 'SF Pro Display', weight: 600, track: -0.01, stack: '"SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  },
  { id: 'serif', label: 'Instrument Serif', group: 'Serif', spec: { family: 'Instrument Serif', weight: 400 } },
  { id: 'geistmono', label: 'Geist Mono', group: 'Mono', spec: { family: 'Geist Mono', weight: 500, track: -0.02 } },
  { id: 'spacemono', label: 'Space Mono', group: 'Mono', spec: { family: 'Space Mono', weight: 700, track: -0.02 } },
  { id: 'inconsolata', label: 'Inconsolata', group: 'Mono', spec: { family: 'Inconsolata', weight: 600 } },
  { id: 'mono', label: 'Plex Mono', group: 'Mono', spec: { family: 'IBM Plex Mono', weight: 500, track: -0.02 } },
  {
    id: 'sfmono', label: 'SF Mono (Apple devices)', group: 'Mono',
    spec: { family: 'SF Mono', weight: 500, track: -0.02, stack: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  },
  { id: 'dancing', label: 'Dancing Script', group: 'Script', spec: { family: 'Dancing Script', weight: 700 } },
  { id: 'satisfy', label: 'Satisfy', group: 'Script', spec: { family: 'Satisfy', weight: 400 } },
  { id: 'anton', label: 'Anton', group: 'Display', spec: { family: 'Anton', weight: 400 } },
  { id: 'barlow', label: 'Barlow Condensed', group: 'Display', spec: { family: 'Barlow Condensed', weight: 600 } },
  { id: 'geistpixel', label: 'Geist Pixel', group: 'Display', spec: { family: 'Geist Pixel', weight: 400 } },
];

/** Canvas will not trigger a webfont download itself, so every face is requested up front. */
export async function loadFonts() {
  const faces = Object.entries(FAMILY_WEIGHTS)
    .filter(([family]) => !family.startsWith('SF '))
    .flatMap(([family, weights]) => weights.map((w) => `${w} 20px "${family}"`));
  await Promise.all(faces.map((f) => document.fonts.load(f, 'Ag0')));
}
