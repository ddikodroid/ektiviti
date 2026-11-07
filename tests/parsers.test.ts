import { describe, expect, it } from 'vitest';
import { Encoder, Profile } from '@garmin/fitsdk';
import { parseFit } from '../src/lib/fit';
import { buildActivity, elevationChange, haversine, normalizedPower } from '../src/lib/analyze';
import { formatDuration, formatPace, metricValue } from '../src/lib/format';

const meta = { id: 't', source: 'file' as const, fallbackName: 'fallback' };

/** Encodes with Garmin's official SDK, so the decoder is checked against an independent writer. */
function fitFixture(): ArrayBuffer {
  const enc = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array };
  const start = new Date('2026-03-01T08:00:00Z');
  const M = Profile.MesgNum;
  enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, serialNumber: 1, timeCreated: start });
  for (let i = 0; i < 120; i++) {
    enc.onMesg(M.RECORD, {
      timestamp: new Date(start.getTime() + i * 1000),
      positionLat: Math.round((51 + i * 0.00002) * (2 ** 31 / 180)),
      positionLong: Math.round(-0.1 * (2 ** 31 / 180)),
      enhancedAltitude: 100 + i * 0.5,
      heartRate: 130 + (i % 10),
      cadence: 85,
      distance: i * 3,
      enhancedSpeed: 3,
      power: 250,
    });
  }
  enc.onMesg(M.SESSION, {
    timestamp: new Date(start.getTime() + 120000),
    startTime: start,
    sport: 'running',
    totalElapsedTime: 125,
    totalTimerTime: 119,
    totalDistance: 357,
    totalAscent: 60,
    totalDescent: 2,
    totalCalories: 40,
    avgHeartRate: 134,
    maxHeartRate: 139,
    normalizedPower: 251,
  });
  const bytes: Uint8Array = enc.close();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('FIT', () => {
  it('decodes a file written by the Garmin SDK', () => {
    const raw = parseFit(fitFixture());
    expect(raw.samples).toHaveLength(120);
    expect(raw.sport).toBe('run');
    const s = raw.samples[10];
    expect(s.lat).toBeCloseTo(51.0002, 4);
    expect(s.lon).toBeCloseTo(-0.1, 4);
    expect(s.ele).toBeCloseTo(105, 1);
    expect(s.hr).toBe(130);
    expect(s.dist).toBeCloseTo(30, 1);
    expect(s.speed).toBeCloseTo(3, 2);
    expect(s.power).toBe(250);
    expect(s.time).toBe(Date.parse('2026-03-01T08:00:10Z'));
    expect(raw.totals).toMatchObject({ distance: 357, elapsedTime: 125, movingTime: 119, elevGain: 60, calories: 40, avgHr: 134, normPower: 251 });
  });
  it('turns a decoded file into an activity', () => {
    const a = buildActivity(parseFit(fitFixture()), meta);
    expect(a.sport).toBe('run');
    expect(a.stats.distance).toBe(357);
    expect(a.stats.avgCadence).toBe(170); // per-leg cadence doubled for running
    expect(a.route.lat.length).toBeGreaterThan(100);
    expect(a.series.ele).toBeDefined();
  });
  it('rejects other binaries', () => {
    expect(() => parseFit(new ArrayBuffer(64))).toThrow(/not a FIT/);
  });
});

describe('analysis', () => {
  it('haversine: one degree of latitude is about 111.2 km', () => {
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });
  it('normalized power equals steady power on a steady ride', () => {
    const t = Array.from({ length: 600 }, (_, i) => i);
    expect(normalizedPower(t, t.map(() => 200))).toBeCloseTo(200, 5);
  });
  it('normalized power exceeds the average on a surging ride', () => {
    const t = Array.from({ length: 1200 }, (_, i) => i);
    const w = t.map((i) => (Math.floor(i / 120) % 2 ? 300 : 100));
    expect(normalizedPower(t, w)!).toBeGreaterThan(210);
  });
  it('ignores elevation jitter but counts real climbs', () => {
    const jitter = Array.from({ length: 200 }, (_, i) => 100 + (i % 2));
    expect(elevationChange(jitter).gain).toBe(0);
    const climb = Array.from({ length: 200 }, (_, i) => i);
    expect(elevationChange(climb).gain).toBeGreaterThan(190);
  });
  it('splits sum to the whole activity', () => {
    const samples = Array.from({ length: 1001 }, (_, i) => ({ time: i * 1000, dist: i * 3.3, ele: 10 }));
    const a = buildActivity({ samples, sport: 'run' }, meta);
    expect(a.splits.km).toHaveLength(4);
    expect(a.splits.km[0].distance).toBe(1000);
    expect(a.splits.km[0].time).toBeCloseTo(303, 0);
    expect(a.splits.km.reduce((s, x) => s + x.distance, 0)).toBeCloseTo(3300, 3);
    expect(a.splits.km.reduce((s, x) => s + x.time, 0)).toBeCloseTo(1000, 0);
  });
  it('does not count a long stop as moving time', () => {
    const samples = [
      ...Array.from({ length: 100 }, (_, i) => ({ time: i * 1000, dist: i * 3 })),
      ...Array.from({ length: 100 }, (_, i) => ({ time: (100 + i) * 1000, dist: 297 })),
    ];
    const a = buildActivity({ samples, sport: 'run' }, meta);
    expect(a.stats.elapsedTime).toBe(199);
    expect(a.stats.movingTime).toBeLessThan(105);
  });
  it('handles an indoor file with no position', () => {
    const samples = Array.from({ length: 50 }, (_, i) => ({ time: i * 1000, hr: 120, power: 200 }));
    const a = buildActivity({ samples, sport: 'ride' }, meta);
    expect(a.route.lat).toHaveLength(0);
    expect(a.series.hr).toBeDefined();
  });
});

describe('formatting', () => {
  it('keeps one time style', () => {
    expect(formatDuration(7500)).toBe('2h 05m');
    expect(formatDuration(2712)).toBe('45m 12s');
    expect(formatPace(292)).toBe('4:52');
    expect(formatPace(299.6)).toBe('5:00');
  });
  it('converts units', () => {
    const a = buildActivity({ samples: [], sport: 'run', totals: { distance: 10000, movingTime: 3000 } }, meta);
    expect(metricValue('distance', a, 'imperial')?.value).toBe('6.21');
    expect(metricValue('pace', a, 'metric')?.value).toBe('5:00');
    expect(metricValue('pace', a, 'imperial')?.unit).toBe('/mi');
  });
});
