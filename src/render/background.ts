import type { Activity, Background, PatternKind } from '../types';

type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise2(seed: number) {
  const r = rng(seed);
  const size = 64;
  const table = Array.from({ length: size * size }, () => r());
  const at = (x: number, y: number) => table[(y & 63) * size + (x & 63)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
  return (x: number, y: number) => value(x, y) * 0.6 + value(x * 2.1, y * 2.1) * 0.28 + value(x * 4.3, y * 4.3) * 0.12;
}

function drawContours(c: Ctx, W: number, H: number, seed: number, stroke: string) {
  const n = noise2(seed);
  const step = 11;
  const cols = Math.ceil(W / step) + 1;
  const rows = Math.ceil(H / step) + 1;
  const f = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) f[y * cols + x] = n((x * step) / 300, (y * step) / 300);
  c.strokeStyle = stroke;
  c.lineWidth = 1.5;
  c.beginPath();
  for (let level = 0.2; level < 0.85; level += 0.04) {
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const a = f[y * cols + x], b = f[y * cols + x + 1], d = f[(y + 1) * cols + x], e = f[(y + 1) * cols + x + 1];
        const pts: [number, number][] = [];
        const edge = (p: number, q: number, x0: number, y0: number, x1: number, y1: number) => {
          if (p < level !== q < level) {
            const t = (level - p) / (q - p);
            pts.push([(x0 + (x1 - x0) * t) * step, (y0 + (y1 - y0) * t) * step]);
          }
        };
        edge(a, b, x, y, x + 1, y);
        edge(b, e, x + 1, y, x + 1, y + 1);
        edge(d, e, x, y + 1, x + 1, y + 1);
        edge(a, d, x, y, x, y + 1);
        for (let i = 0; i + 1 < pts.length; i += 2) {
          c.moveTo(pts[i][0], pts[i][1]);
          c.lineTo(pts[i + 1][0], pts[i + 1][1]);
        }
      }
    }
  }
  c.stroke();
}

/** Stacked silhouettes. The front ridge is the real elevation profile when the activity has one. */
function drawRidges(c: Ctx, W: number, H: number, seed: number, stroke: string, fill: string, ele?: number[]) {
  const n = noise2(seed);
  const lines = 22;
  // Kept to the middle band, clear of where templates place the title and stats.
  const top = H * 0.38;
  const bottom = H * 0.68;
  const lo = ele ? Math.min(...ele) : 0;
  const span = ele ? Math.max(...ele) - lo || 1 : 1;
  c.lineWidth = 2;
  c.strokeStyle = stroke;
  c.fillStyle = fill;
  for (let i = 0; i < lines; i++) {
    const p = i / (lines - 1);
    const base = top + (bottom - top) * p;
    const amp = H * 0.11 * (0.45 + p * 0.55);
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const u = x / W;
      const real = ele ? (ele[Math.min(ele.length - 1, Math.floor(u * ele.length))] - lo) / span : 0.5;
      const texture = n(u * 3.2 + i * 0.37, i * 0.51);
      const y = base - amp * (real * p + texture * (1.5 - p));
      c.lineTo(x, y);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

function drawDots(c: Ctx, W: number, H: number, stroke: string) {
  c.fillStyle = stroke;
  const gap = 36;
  c.beginPath();
  for (let y = gap / 2; y < H; y += gap) {
    for (let x = gap / 2; x < W; x += gap) {
      c.moveTo(x + 2.4, y);
      c.arc(x, y, 2.4, 0, Math.PI * 2);
    }
  }
  c.fill();
}

function grainTile(seed: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() > 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = r() * 34;
  }
  c.putImageData(img, 0, 0);
  return canvas;
}

const patternCache = new Map<string, HTMLCanvasElement>();

function patternLayer(kind: PatternKind, W: number, H: number, k: number, bg: Background, line: string, a: Activity) {
  const key = [kind, W, H, k.toFixed(3), bg.color, line, a.id].join('|');
  const hit = patternCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(W * k));
  canvas.height = Math.max(1, Math.round(H * k));
  const c = canvas.getContext('2d')!;
  c.scale(k, k);
  const seed = hash(a.id);
  const stroke = line + '55';
  if (kind === 'contours') drawContours(c, W, H, seed, stroke);
  else if (kind === 'ridges') drawRidges(c, W, H, seed, line + 'aa', bg.color, a.series.ele);
  else if (kind === 'dots') drawDots(c, W, H, stroke);
  else {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = c.createPattern(grainTile(seed), 'repeat')!;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (patternCache.size > 24) patternCache.delete(patternCache.keys().next().value!);
  patternCache.set(key, canvas);
  return canvas;
}

function linear(c: Ctx, W: number, H: number, angle: number, from: string, to: string) {
  const r = ((angle - 90) * Math.PI) / 180;
  const half = (Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r))) / 2;
  const dx = Math.cos(r) * half;
  const dy = Math.sin(r) * half;
  const g = c.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

let processed: { photo: ImageBitmap; blur: number; mono: boolean; canvas: HTMLCanvasElement } | null = null;

/** Blur and mono are built from resizing and blend modes, because Safari lacks ctx.filter. */
function processPhoto(photo: ImageBitmap, blur: number, mono: boolean): CanvasImageSource {
  if (!blur && !mono) return photo;
  if (processed && processed.photo === photo && processed.blur === blur && processed.mono === mono) return processed.canvas;
  const scale = Math.min(1, 2048 / Math.max(photo.width, photo.height));
  const w = Math.round(photo.width * scale);
  const h = Math.round(photo.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingQuality = 'high';
  if (blur > 0) {
    // Stepping down and back up in halves gives a soft result with no block edges.
    const passes = Math.round(1 + blur * 5);
    let src: CanvasImageSource = photo;
    let sw = photo.width, sh = photo.height;
    const stack: HTMLCanvasElement[] = [];
    for (let i = 0; i < passes; i++) {
      const t = document.createElement('canvas');
      t.width = Math.max(2, Math.round((i === 0 ? w : sw) / 2));
      t.height = Math.max(2, Math.round((i === 0 ? h : sh) / 2));
      const tc = t.getContext('2d')!;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, t.width, t.height);
      src = t; sw = t.width; sh = t.height;
      stack.push(t);
    }
    for (let i = stack.length - 2; i >= 0; i--) {
      const t = stack[i];
      const tc = t.getContext('2d')!;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, t.width, t.height);
      src = t;
    }
    c.drawImage(src, 0, 0, w, h);
  } else {
    c.drawImage(photo, 0, 0, w, h);
  }
  if (mono) {
    c.globalCompositeOperation = 'saturation';
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }
  processed = { photo, blur, mono, canvas };
  return canvas;
}

export function drawBackground(
  c: Ctx, W: number, H: number, k: number, bg: Background, accent: string, a: Activity, photo: ImageBitmap | null,
) {
  if (bg.kind === 'transparent') return;
  if (bg.kind === 'gradient') {
    if (bg.gradient === 'linear') {
      c.fillStyle = linear(c, W, H, bg.angle, bg.color, bg.color2);
      c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = bg.color2;
      c.fillRect(0, 0, W, H);
      const r = rng(hash(a.id));
      const spots: [number, number, number][] = [[0.8, 0.15, 0.9], [0.1, 0.75, 0.8], [0.2 + r() * 0.6, 0.45, 0.5]];
      for (const [x, y, size] of spots) {
        const R = Math.max(W, H) * size;
        const g = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
        g.addColorStop(0, bg.color);
        g.addColorStop(1, bg.color + '00');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
      }
    }
    return;
  }
  if (bg.kind === 'photo' && photo) {
    const src = processPhoto(photo, bg.blur, bg.mono);
    const scale = Math.max(W / photo.width, H / photo.height) * bg.zoom;
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, (W - dw) / 2 + (bg.panX * (dw - W)) / 2, (H - dh) / 2 + (bg.panY * (dh - H)) / 2, dw, dh);
    if (bg.dim > 0) {
      c.fillStyle = `rgba(0,0,0,${bg.dim})`;
      c.fillRect(0, 0, W, H);
    }
    return;
  }
  c.fillStyle = bg.color;
  c.fillRect(0, 0, W, H);
  if (bg.kind === 'pattern') {
    const n = parseInt(bg.color.slice(1), 16);
    const light = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 128;
    const line = bg.pattern === 'ridges' ? accent : light ? '#000000' : '#ffffff';
    const layer = patternLayer(bg.pattern, W, H, k, bg, line, a);
    c.drawImage(layer, 0, 0, W, H);
  }
}
