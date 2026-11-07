import { useEffect, useState } from 'react';
import type { Aspect } from '../types';
import { resolveLayers, sceneSize } from '../render/engine';
import { loadFonts } from '../render/fonts';
import { currentActivity, useStudio, type Tab } from '../state/store';
import { Segmented } from './controls';
import { ActivityPanel, BackgroundPanel, ExportPanel, OverlayPanel, TemplatePanel } from './panels';
import { Stage } from './Stage';

const TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'template', label: 'Template' },
  { id: 'background', label: 'Background' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'export', label: 'Export' },
];

export function App() {
  const tab = useStudio((s) => s.tab);
  const design = useStudio((s) => s.design);
  const units = useStudio((s) => s.units);
  const photo = useStudio((s) => s.photo);
  const safeZones = useStudio((s) => s.safeZones);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const errors = useStudio((s) => s.errors);
  const sample = useStudio((s) => currentActivity(s).source === 'sample');
  const { setTab, edit, setUnits, undo, redo, toggleSafeZones, dismissErrors, hydrate, uploadFit } = useStudio.getState();
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    void loadFonts().finally(() => setFontsReady(true));
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) && (target as HTMLInputElement).type !== 'range') return;
      const s = useStudio.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.key === 'Escape') s.select(null);
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step || !s.selected) return;
      const a = currentActivity(s);
      const layer = resolveLayers(a, s.design, sceneSize(s.design.aspect, s.photo?.bitmap ?? null)).find((l) => l.id === s.selected);
      if (!layer || target.tagName === 'INPUT') return;
      e.preventDefault();
      const by = e.shiftKey ? 0.02 : 0.004;
      const [x, y, w, h] = layer.rect;
      s.editLayer(layer.id, { rect: [x + step[0] * by, y + step[1] * by, w, h] }, `nudge-${layer.id}`);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // Dropping a file anywhere in the window beats hunting for the drop zone.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void uploadFit(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [uploadFit]);

  const aspects: { value: Aspect; label: string; disabled?: boolean }[] = [
    { value: '9:16', label: '9:16' }, { value: '4:5', label: '4:5' }, { value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' },
    ...(photo ? [{ value: 'photo' as Aspect, label: 'Photo' }] : []),
  ];

  return (
    <div className="app">
      <header className="top">
        <h1><span aria-hidden>⌜⌟</span> Activity in Frame</h1>
        <div className="tools">
          <button onClick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
          <button onClick={redo} disabled={!canRedo} aria-label="Redo">↷</button>
          <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'metric', label: 'km' }, { value: 'imperial', label: 'mi' }]} />
        </div>
      </header>

      <aside className="side">
        <nav className="tabs" aria-label="Steps">
          {TABS.map((t, i) => (
            <button key={t.id} aria-current={tab === t.id ? 'step' : undefined} onClick={() => setTab(t.id)}>
              <em>{i + 1}</em>{t.label}
            </button>
          ))}
        </nav>
        <div className="panel">
          {errors.length > 0 && (
            <div className="errors" role="alert">
              {errors.map((e) => <p key={e}>{e}</p>)}
              <button className="link" onClick={dismissErrors}>Dismiss</button>
            </div>
          )}
          {tab === 'activity' && <ActivityPanel />}
          {tab === 'template' && <TemplatePanel />}
          {tab === 'background' && <BackgroundPanel />}
          {tab === 'overlay' && <OverlayPanel />}
          {tab === 'export' && <ExportPanel />}
        </div>
      </aside>

      <main className="work">
        <div className="bar">
          <Segmented label="Aspect ratio" value={design.aspect} onChange={(aspect) => edit({ aspect })} options={aspects} />
          {design.aspect === '9:16' && <button className={`pill ${safeZones ? 'on' : ''}`} aria-pressed={safeZones} onClick={toggleSafeZones}>Safe zones</button>}
          {sample && <span className="note">Sample data. Upload a .fit file to use your own.</span>}
        </div>
        <Stage fontsReady={fontsReady} />
      </main>
    </div>
  );
}
