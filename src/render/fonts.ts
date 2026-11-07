import '@fontsource/anton/400.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';

export interface FontSpec { family: string; weight: number; track?: number }

export const FONT_CHOICES: { id: string; label: string; spec: FontSpec }[] = [
  { id: 'anton', label: 'Anton', spec: { family: 'Anton', weight: 400 } },
  { id: 'barlow', label: 'Barlow Condensed', spec: { family: 'Barlow Condensed', weight: 600 } },
  { id: 'serif', label: 'Instrument Serif', spec: { family: 'Instrument Serif', weight: 400 } },
  { id: 'bricolage', label: 'Bricolage', spec: { family: 'Bricolage Grotesque', weight: 700, track: -0.01 } },
  { id: 'plex', label: 'Plex Sans', spec: { family: 'IBM Plex Sans', weight: 500 } },
  { id: 'mono', label: 'Plex Mono', spec: { family: 'IBM Plex Mono', weight: 500, track: -0.02 } },
];

/** Canvas will not trigger a webfont download itself, so every face is requested up front. */
export async function loadFonts() {
  const faces = [
    '400 20px Anton', '400 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '400 20px "Instrument Serif"',
    '500 20px "Bricolage Grotesque"', '700 20px "Bricolage Grotesque"', '400 20px "IBM Plex Mono"',
    '500 20px "IBM Plex Mono"', '400 20px "IBM Plex Sans"', '500 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"',
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f, 'Ag0')));
}
