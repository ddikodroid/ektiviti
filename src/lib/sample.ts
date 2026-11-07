import type { Activity, Sample } from '../types';
import { buildActivity } from './analyze';

/** Made-up activities, so the studio has something to show before the first upload. */
function generate(kind: 'run' | 'ride'): Sample[] {
  const ride = kind === 'ride';
  const count = ride ? 2400 : 1500;
  const dt = ride ? 4 : 5;
  const speed = ride ? 8.4 : 3.1;
  const start = Date.UTC(2026, 9, 18, 6, 40);
  const radius = ride ? 0.13 : 0.035;
  const out: Sample[] = [];
  let dist = 0;
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1);
    const a = p * Math.PI * 2;
    const wobble = 1 + 0.32 * Math.sin(a * 3 + 1) + 0.14 * Math.sin(a * 7 + 2) + 0.05 * Math.sin(a * 17);
    const climb = Math.sin(a * 2 - 1) * 0.5 + Math.sin(a * 5) * 0.25 + Math.sin(a * 11 + 1) * 0.08;
    const v = speed * (1 - climb * 0.16 + 0.05 * Math.sin(i / 9));
    dist += v * dt;
    out.push({
      time: start + i * dt * 1000,
      lat: 46.62 + radius * wobble * Math.sin(a) * 0.72,
      lon: 8.03 + radius * wobble * Math.cos(a),
      ele: (ride ? 900 : 640) + climb * (ride ? 420 : 130),
      dist,
      speed: v,
      hr: Math.round((ride ? 138 : 152) + climb * 14 + p * 9 + 3 * Math.sin(i / 13)),
      cad: Math.round((ride ? 86 : 86) - climb * 4),
      power: ride ? Math.round(205 + climb * 90 + 26 * Math.sin(i / 5)) : undefined,
      temp: 11 + p * 4,
    });
  }
  return out;
}

export function sampleActivities(): Activity[] {
  return [
    buildActivity({ name: 'Sample long run', sport: 'run', start: Date.UTC(2026, 9, 18, 6, 40), samples: generate('run') },
      { id: 'sample-run', source: 'sample', fallbackName: 'Sample run' }),
    buildActivity({ name: 'Sample hill ride', sport: 'ride', start: Date.UTC(2026, 9, 18, 6, 40), samples: generate('ride') },
      { id: 'sample-ride', source: 'sample', fallbackName: 'Sample ride' }),
  ];
}
