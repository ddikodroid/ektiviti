import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../types';
import { LAYER_NAMES, renderScene, resolveLayers, sceneSize } from '../render/engine';
import { currentActivity, useStudio } from '../state/store';

type Drag =
  | { kind: 'move'; id: string; rect: Rect; x: number; y: number }
  | { kind: 'resize'; id: string; rect: Rect; x: number; y: number; corner: string }
  | { kind: 'pan'; panX: number; panY: number; x: number; y: number };

const SNAP = 0.012;

export function Stage({ fontsReady }: { fontsReady: boolean }) {
  const activity = useStudio(currentActivity);
  const design = useStudio((s) => s.design);
  const units = useStudio((s) => s.units);
  const photo = useStudio((s) => s.photo);
  const selected = useStudio((s) => s.selected);
  const safeZones = useStudio((s) => s.safeZones);
  const select = useStudio((s) => s.select);
  const editLayer = useStudio((s) => s.editLayer);
  const editBackground = useStudio((s) => s.editBackground);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState({ x: false, y: false });

  const bitmap = photo?.bitmap ?? null;
  const size = useMemo(() => sceneSize(design.aspect, bitmap), [design.aspect, bitmap]);
  const layers = useMemo(() => resolveLayers(activity, design, size), [activity, design, size]);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = Math.min(box.w / size[0], box.h / size[1]) || 0;
  const cssW = Math.floor(size[0] * fit);
  const cssH = Math.floor(size[1] * fit);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssW) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = (cssW * dpr) / size[0];
    canvas.width = Math.round(size[0] * k);
    canvas.height = Math.round(size[1] * k);
    const id = requestAnimationFrame(() => renderScene(canvas.getContext('2d')!, { activity, design, units, photo: bitmap }, k));
    return () => cancelAnimationFrame(id);
  }, [activity, design, units, bitmap, cssW, size, fontsReady]);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const down = (e: React.PointerEvent) => {
    const p = point(e);
    const handle = (e.target as HTMLElement).dataset.corner;
    const current = layers.find((l) => l.id === selected);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (handle && current) {
      drag.current = { kind: 'resize', id: current.id, rect: current.rect, corner: handle, ...p };
      return;
    }
    const hit = [...layers].reverse().find((l) => {
      const [x, y, w, h] = l.rect;
      return l.editable && !l.hidden && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    });
    if (hit) {
      select(hit.id);
      drag.current = { kind: 'move', id: hit.id, rect: hit.rect, ...p };
    } else {
      select(null);
      if (design.background.kind === 'photo' && bitmap) {
        drag.current = { kind: 'pan', panX: design.background.panX, panY: design.background.panY, ...p };
      }
    }
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (d.kind === 'pan') {
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      editBackground({ panX: clamp(d.panX + dx * 2), panY: clamp(d.panY + dy * 2) }, 'pan');
    } else if (d.kind === 'move') {
      const [, , w, h] = d.rect;
      let x = d.rect[0] + dx;
      let y = d.rect[1] + dy;
      const snapX = Math.abs(x + w / 2 - 0.5) < SNAP;
      const snapY = Math.abs(y + h / 2 - 0.5) < SNAP;
      if (snapX) x = 0.5 - w / 2;
      if (snapY) y = 0.5 - h / 2;
      setGuides({ x: snapX, y: snapY });
      editLayer(d.id, { rect: [x, y, w, h] }, `move-${d.id}`);
    } else {
      let [x, y, w, h] = d.rect;
      const min = 0.04;
      if (d.corner.includes('e')) w = Math.max(min, w + dx);
      if (d.corner.includes('s')) h = Math.max(min, h + dy);
      if (d.corner.includes('w')) { const nw = Math.max(min, w - dx); x += w - nw; w = nw; }
      if (d.corner.includes('n')) { const nh = Math.max(min, h - dy); y += h - nh; h = nh; }
      editLayer(d.id, { rect: [x, y, w, h] }, `size-${d.id}`);
    }
  };

  const up = () => {
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  const active = layers.find((l) => l.id === selected && !l.hidden);
  const checker = design.background.kind === 'transparent';

  return (
    <div className="stage" ref={wrapRef}>
      <div
        className={`sheet ${checker ? 'checker' : ''}`}
        style={{ width: cssW, height: cssH }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <canvas ref={canvasRef} aria-label={`Preview of ${activity.name}`} role="img" />
        {guides.x && <i className="guide gx" />}
        {guides.y && <i className="guide gy" />}
        {safeZones && design.aspect === '9:16' && (<><i className="safe top" /><i className="safe bottom" /></>)}
        {active && (
          <div
            className="selection"
            style={{
              left: `${active.rect[0] * 100}%`, top: `${active.rect[1] * 100}%`,
              width: `${active.rect[2] * 100}%`, height: `${active.rect[3] * 100}%`,
            }}
          >
            <span className="tag">{LAYER_NAMES[active.type]}</span>
            {['nw', 'ne', 'sw', 'se'].map((c) => <b key={c} className={c} data-corner={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
