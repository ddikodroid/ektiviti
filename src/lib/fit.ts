import type { RawActivity, Sample, Sport, Totals } from '../types';

/**
 * A small FIT decoder covering what this app needs: record and session messages.
 * Field numbers come from the FIT profile. Developer fields are skipped.
 */
const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in unix seconds
const SEMI = 180 / 2 ** 31;

interface FieldDef { num: number; size: number; base: number }
interface MsgDef { little: boolean; global: number; fields: FieldDef[]; devSize: number }

const BASE_SIZE: Record<number, number> = {
  0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8,
};

function readValue(dv: DataView, pos: number, base: number, little: boolean): number | undefined {
  switch (base) {
    case 0: case 2: case 13: { const v = dv.getUint8(pos); return v === 0xff ? undefined : v; }
    case 1: { const v = dv.getInt8(pos); return v === 0x7f ? undefined : v; }
    case 3: { const v = dv.getInt16(pos, little); return v === 0x7fff ? undefined : v; }
    case 4: { const v = dv.getUint16(pos, little); return v === 0xffff ? undefined : v; }
    case 5: { const v = dv.getInt32(pos, little); return v === 0x7fffffff ? undefined : v; }
    case 6: { const v = dv.getUint32(pos, little); return v === 0xffffffff ? undefined : v; }
    case 8: { const v = dv.getFloat32(pos, little); return Number.isFinite(v) ? v : undefined; }
    case 9: { const v = dv.getFloat64(pos, little); return Number.isFinite(v) ? v : undefined; }
    case 10: { const v = dv.getUint8(pos); return v === 0 ? undefined : v; }
    case 11: { const v = dv.getUint16(pos, little); return v === 0 ? undefined : v; }
    case 12: { const v = dv.getUint32(pos, little); return v === 0 ? undefined : v; }
    default: return undefined; // strings and 64-bit ints are not needed here
  }
}

const SPORTS: Record<number, Sport> = {
  1: 'run', 2: 'ride', 4: 'workout', 5: 'swim', 10: 'workout', 11: 'walk', 17: 'hike', 21: 'ride',
};

const scaled = (v: number | undefined, by: number) => (v === undefined ? undefined : v / by);
const ms = (fitSeconds: number) => (fitSeconds + FIT_EPOCH) * 1000;

export function parseFit(buffer: ArrayBuffer): RawActivity {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 14) throw new Error('This FIT file is too short to be valid.');
  const headerSize = dv.getUint8(0);
  const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if (sig !== '.FIT') throw new Error('This is not a FIT file.');
  const end = Math.min(headerSize + dv.getUint32(4, true), buffer.byteLength);

  const defs = new Map<number, MsgDef>();
  const samples: Sample[] = [];
  const sessions: Record<number, number | undefined>[] = [];
  let pos = headerSize;
  let lastTs = 0;

  while (pos < end) {
    const header = dv.getUint8(pos++);

    if (!(header & 0x80) && header & 0x40) {
      const hasDev = !!(header & 0x20);
      const local = header & 0x0f;
      pos++; // reserved
      const little = dv.getUint8(pos++) === 0;
      const global = dv.getUint16(pos, little);
      pos += 2;
      const count = dv.getUint8(pos++);
      const fields: FieldDef[] = [];
      for (let i = 0; i < count; i++) {
        fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1), base: dv.getUint8(pos + 2) & 0x1f });
        pos += 3;
      }
      let devSize = 0;
      if (hasDev) {
        const devCount = dv.getUint8(pos++);
        for (let i = 0; i < devCount; i++) {
          devSize += dv.getUint8(pos + 1);
          pos += 3;
        }
      }
      defs.set(local, { little, global, fields, devSize });
      continue;
    }

    const compressed = !!(header & 0x80);
    const local = compressed ? (header >> 5) & 0x03 : header & 0x0f;
    const def = defs.get(local);
    if (!def) throw new Error('This FIT file is corrupt: data appears before its definition.');

    const values: Record<number, number | undefined> = {};
    for (const f of def.fields) {
      // Array fields keep their first element, which is all these messages use.
      if (f.size >= (BASE_SIZE[f.base] ?? 1)) values[f.num] = readValue(dv, pos, f.base, def.little);
      pos += f.size;
    }
    pos += def.devSize;

    if (compressed) {
      const offset = header & 0x1f;
      let ts = (lastTs & ~0x1f) + offset;
      if (offset < (lastTs & 0x1f)) ts += 0x20;
      values[253] = ts;
    }
    if (values[253] !== undefined) lastTs = values[253]!;

    if (def.global === 20) {
      const v = values;
      samples.push({
        time: v[253] !== undefined ? ms(v[253]!) : undefined,
        lat: v[0] !== undefined ? v[0] * SEMI : undefined,
        lon: v[1] !== undefined ? v[1] * SEMI : undefined,
        ele: v[78] !== undefined ? v[78] / 5 - 500 : v[2] !== undefined ? v[2] / 5 - 500 : undefined,
        hr: v[3],
        cad: v[4],
        dist: scaled(v[5], 100),
        speed: scaled(v[73] ?? v[6], 1000),
        power: v[7],
        temp: v[13],
      });
    } else if (def.global === 18) {
      sessions.push(values);
    }
  }

  if (!samples.length && !sessions.length) throw new Error('No activity data found in this FIT file.');

  const out: RawActivity = { samples, start: samples.find((s) => s.time)?.time };
  if (sessions.length) {
    const s = sessions[0];
    const add = (n: number, by = 1) => {
      let total = 0;
      let seen = false;
      for (const x of sessions) if (x[n] !== undefined) { total += x[n]! / by; seen = true; }
      return seen ? total : undefined;
    };
    const totals: Totals = {
      distance: add(9, 100),
      elapsedTime: add(7, 1000),
      movingTime: add(8, 1000),
      calories: add(11),
      elevGain: add(22),
      elevLoss: add(23),
    };
    if (sessions.length === 1) {
      // Averages cannot be summed, so multi-session files derive them from samples.
      Object.assign(totals, {
        avgSpeed: scaled(s[124] ?? s[14], 1000),
        maxSpeed: scaled(s[125] ?? s[15], 1000),
        avgHr: s[16], maxHr: s[17], avgCadence: s[18], avgPower: s[20], maxPower: s[21], normPower: s[34],
      });
    }
    out.totals = totals;
    if (s[5] !== undefined) out.sport = SPORTS[s[5]] ?? 'other';
    if (!out.start && s[2] !== undefined) out.start = ms(s[2]);
  }
  return out;
}
