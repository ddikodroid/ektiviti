import { useEffect, useMemo, useRef, useState } from 'react';
import type { Align, BackgroundKind, MetricId, PatternKind, RouteColorBy, SeriesKey, StatsVariant } from '../types';
import { ALL_METRICS, defaultMetrics, distanceIn, formatDate, formatDuration, METRICS, SPORT_LABEL } from '../lib/format';
import { exportBlob, LAYER_NAMES, renderScene, resolveType, resolveLayers, sceneSize, SERIES_LABEL, type ExportOptions } from '../render/engine';
import { FONT_CHOICES, supportsWeight, WEIGHT_CHOICES } from '../render/fonts';
import { GRADIENTS, PALETTES, TEMPLATES, withTemplate } from '../render/templates';
import { currentActivity, useStudio } from '../state/store';
import { Color, Field, Section, Segmented, Slider, Toggle } from './controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ActivityPanel() {
  const activities = useStudio((s) => s.activities);
  const activity = useStudio(currentActivity);
  const units = useStudio((s) => s.units);
  const design = useStudio((s) => s.design);
  const busy = useStudio((s) => s.busy);
  const { uploadFit, chooseActivity, deleteActivity, edit } = useStudio.getState();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <Section title="Upload">
        <button
          className={`drop ${over ? 'over' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void uploadFit(Array.from(e.dataTransfer.files)); }}
        >
          <strong>{busy ? 'Reading…' : 'Choose a .fit file'}</strong>
          <small>or drop it here. It stays in this browser.</small>
        </button>
        {/* No accept filter: iOS greys out .fit files when one is set. The decoder checks the file itself. */}
        <input
          ref={input} type="file" multiple hidden
          onChange={(e) => { void uploadFit(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
      </Section>
      <Section title="Activities">
        <ul className="activities">
          {activities.map((a) => (
            <li key={a.id} className={a.id === activity.id ? 'on' : ''}>
              <button onClick={() => chooseActivity(a.id)} aria-pressed={a.id === activity.id}>
                <strong>{a.name}</strong>
                <small>
                  {a.source === 'sample' ? 'Sample' : formatDate(a.start)} · {SPORT_LABEL[a.sport]}
                  {a.stats.distance > 0 && ` · ${distanceIn(a.stats.distance, units).toFixed(1)} ${units === 'metric' ? 'km' : 'mi'}`}
                  {` · ${formatDuration(a.stats.movingTime)}`}
                </small>
              </button>
              {a.source === 'file' && <button className="x" aria-label={`Remove ${a.name}`} onClick={() => deleteActivity(a.id)}>×</button>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Words">
        <Field label="Title" value={design.title ?? ''} placeholder={activity.name} onChange={(v) => edit({ title: v || null }, 'title')} />
        <Field label="Subtitle" value={design.subtitle ?? ''} placeholder={`${formatDate(activity.start)} · ${SPORT_LABEL[activity.sport]}`} onChange={(v) => edit({ subtitle: v || null }, 'subtitle')} />
        <Field label="Note" value={design.caption} placeholder="Optional line of text" onChange={(v) => edit({ caption: v }, 'caption')} />
      </Section>
    </>
  );
}

function Thumb({ id, index }: { id: string; index: number }) {
  const activity = useStudio(currentActivity);
  const design = useStudio((s) => s.design);
  const units = useStudio((s) => s.units);
  const photo = useStudio((s) => s.photo?.bitmap ?? null);
  const ref = useRef<HTMLCanvasElement>(null);
  const aspect = design.aspect;
  const metrics = design.metrics;
  const bgKind = design.background.kind;

  useEffect(() => {
    const canvas = ref.current!;
    const [W, H] = sceneSize(aspect, photo);
    const k = 300 / Math.max(W, H);
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    const d = withTemplate({ ...useStudio.getState().design, aspect, metrics, layout: {}, title: null, subtitle: null, caption: '' }, id);
    const job = setTimeout(() => renderScene(canvas.getContext('2d')!, { activity, design: d, units, photo }, k), index * 12);
    return () => clearTimeout(job);
  }, [id, index, activity, aspect, metrics, units, photo, bgKind]);

  return <canvas ref={ref} />;
}

export function TemplatePanel() {
  const current = useStudio((s) => s.design.templateId);
  const useTemplate = useStudio((s) => s.useTemplate);
  const collections = useMemo(() => [...new Set(TEMPLATES.map((t) => t.collection))], []);
  return (
    <>
      {collections.map((name) => (
        <Section key={name} title={name}>
          <div className="contact">
            {TEMPLATES.filter((t) => t.collection === name).map((t) => (
              <button key={t.id} className={t.id === current ? 'on' : ''} aria-pressed={t.id === current} onClick={() => useTemplate(t.id)}>
                <Thumb id={t.id} index={TEMPLATES.indexOf(t)} />
                <span><em>{String(TEMPLATES.indexOf(t) + 1).padStart(2, '0')}A</em>{t.name}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

export function BackgroundPanel() {
  const design = useStudio((s) => s.design);
  const photo = useStudio((s) => s.photo);
  const { editBackground, edit, setPhoto, clearPhoto } = useStudio.getState();
  const bg = design.background;
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Section title="Type">
        <Segmented<BackgroundKind>
          label="Background type" value={bg.kind} onChange={(kind) => (kind === 'photo' && !photo ? input.current?.click() : editBackground({ kind }))}
          options={[
            { value: 'photo', label: 'Photo' }, { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' },
            { value: 'pattern', label: 'Graphic' }, { value: 'transparent', label: 'None' },
          ]}
        />
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void setPhoto(f); e.target.value = ''; }} />
      </Section>

      {bg.kind === 'photo' && (
        <Section title="Photo" aside={photo && <button className="link" onClick={clearPhoto}>Remove</button>}>
          <button className="ghost" onClick={() => input.current?.click()}>{photo ? 'Replace photo' : 'Choose photo'}</button>
          <p className="hint">Drag an empty part of the image to reposition the photo.</p>
          <Slider label="Zoom" value={bg.zoom} min={1} max={3} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(zoom) => editBackground({ zoom }, 'zoom')} />
          <Slider label="Darken" value={bg.dim} min={0} max={0.85} step={0.01} format={pct} onChange={(dim) => editBackground({ dim }, 'dim')} />
          <Slider label="Blur" value={bg.blur} min={0} max={1} step={0.2} format={pct} onChange={(blur) => editBackground({ blur }, 'blur')} />
          <Toggle label="Black and white" checked={bg.mono} onChange={(mono) => editBackground({ mono })} />
        </Section>
      )}

      {bg.kind === 'solid' && (
        <Section title="Colour"><Color label="Background" value={bg.color} onChange={(color) => editBackground({ color }, 'bg')} /></Section>
      )}

      {bg.kind === 'gradient' && (
        <Section title="Gradient">
          <div className="swatches">
            {GRADIENTS.map(([a, b]) => (
              <button key={a + b} aria-label={`Gradient ${a} to ${b}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => editBackground({ color: a, color2: b })} />
            ))}
          </div>
          <Segmented label="Gradient style" value={bg.gradient} onChange={(gradient) => editBackground({ gradient })} options={[{ value: 'linear', label: 'Linear' }, { value: 'glow', label: 'Glow' }]} />
          <div className="pair">
            <Color label="From" value={bg.color} onChange={(color) => editBackground({ color }, 'bg')} />
            <Color label="To" value={bg.color2} onChange={(color2) => editBackground({ color2 }, 'bg2')} />
          </div>
          {bg.gradient === 'linear' && <Slider label="Angle" value={bg.angle} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(angle) => editBackground({ angle }, 'angle')} />}
        </Section>
      )}

      {bg.kind === 'pattern' && (
        <Section title="Graphic">
          <Segmented<PatternKind> label="Graphic style" value={bg.pattern} onChange={(pattern) => editBackground({ pattern })}
            options={[{ value: 'contours', label: 'Contours' }, { value: 'ridges', label: 'Ridges' }, { value: 'dots', label: 'Dots' }, { value: 'grain', label: 'Grain' }]} />
          <Color label="Base colour" value={bg.color} onChange={(color) => editBackground({ color }, 'bg')} />
          {bg.pattern === 'ridges' && <p className="hint">The front ridge traces this activity’s elevation.</p>}
        </Section>
      )}

      {bg.kind === 'transparent' && (
        <Section title="Overlay ink">
          <p className="hint">Exports with no background, ready to lay over a photo or story.</p>
          <Segmented label="Overlay ink" value={design.ink === '#111111' ? 'dark' : 'light'} onChange={(v) => { const c = v === 'dark' ? '#111111' : '#ffffff'; edit({ ink: c, accent: c }); }}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Section>
      )}
    </>
  );
}

export function OverlayPanel() {
  const design = useStudio((s) => s.design);
  const activity = useStudio(currentActivity);
  const units = useStudio((s) => s.units);
  const photo = useStudio((s) => s.photo?.bitmap ?? null);
  const selected = useStudio((s) => s.selected);
  const { edit, editRoute, editLayer, resetLayout, select, editBackground } = useStudio.getState();

  const chosen: MetricId[] = design.metrics ?? defaultMetrics(activity.sport);
  const available = ALL_METRICS.filter((id) => METRICS[id].read(activity.stats, units) !== null);
  const unused = available.filter((id) => !chosen.includes(id));
  const series = Object.keys(activity.series) as SeriesKey[];
  const routeSeries = series.filter((k) => activity.route[k]);
  const layers = resolveLayers(activity, design, sceneSize(design.aspect, photo)).filter((l) => l.editable);
  const hasRoute = layers.some((l) => l.type === 'route');
  const hasChart = layers.some((l) => l.type === 'chart');

  const shift = (i: number, by: number) => {
    const next = [...chosen];
    const [m] = next.splice(i, 1);
    next.splice(i + by, 0, m);
    edit({ metrics: next });
  };

  return (
    <>
      <Section title="Data points">
        <ol className="metrics">
          {chosen.map((id, i) => {
            const missing = !available.includes(id);
            return (
              <li key={id} className={missing ? 'missing' : ''}>
                <span>{METRICS[id].label}{missing && <small> not in this file</small>}</span>
                <button aria-label={`Move ${METRICS[id].label} up`} disabled={i === 0} onClick={() => shift(i, -1)}>↑</button>
                <button aria-label={`Move ${METRICS[id].label} down`} disabled={i === chosen.length - 1} onClick={() => shift(i, 1)}>↓</button>
                <button aria-label={`Remove ${METRICS[id].label}`} onClick={() => edit({ metrics: chosen.filter((m) => m !== id) })}>×</button>
              </li>
            );
          })}
        </ol>
        {unused.length > 0 && (
          <div className="chips">
            {unused.map((id) => <button key={id} onClick={() => edit({ metrics: [...chosen, id] })}>+ {METRICS[id].label}</button>)}
          </div>
        )}
        <Segmented<StatsVariant | 'auto'> label="Stats layout" value={design.statsVariant} onChange={(statsVariant) => edit({ statsVariant })}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'row', label: 'Row' }, { value: 'grid', label: 'Grid' }, { value: 'stack', label: 'Stack' }, { value: 'column', label: 'List' }, { value: 'hero', label: 'Hero' }]} />
        <Segmented<Align | 'auto'> label="Stats alignment" value={design.statsAlign} onChange={(statsAlign) => edit({ statsAlign })}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} />
        {design.statsVariant === 'column' && <p className="hint">List keeps labels left and values right, so alignment does not apply.</p>}
      </Section>

      <Section title="Colour">
        <div className="swatches">
          {PALETTES.map((p) => (
            <button key={p.name} aria-label={`${p.name} palette`} title={p.name} style={{ background: p.bg, color: p.accent }}
              onClick={() => { edit({ ink: p.ink, accent: p.accent }); if (design.background.kind !== 'photo' && design.background.kind !== 'transparent') editBackground({ kind: 'solid', color: p.bg }); }}>
              <i style={{ background: p.accent }} />
            </button>
          ))}
        </div>
        <div className="pair">
          <Color label="Text" value={design.ink} onChange={(ink) => edit({ ink }, 'ink')} />
          <Color label="Accent" value={design.accent} onChange={(accent) => edit({ accent }, 'accent')} />
        </div>
        {design.templateId === 'gallery' && <Color label="Mat" value={design.paper} onChange={(paper) => edit({ paper }, 'paper')} />}
      </Section>

      <Section title="Type">
        <label className="field">
          <span>Typeface</span>
          <select value={design.font ?? ''} onChange={(e) => edit({ font: e.target.value || null, fontWeight: null })}>
            <option value="">Template default</option>
            {[...new Set(FONT_CHOICES.map((f) => f.group))].map((group) => (
              <optgroup key={group} label={group}>
                {FONT_CHOICES.filter((f) => f.group === group).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <WeightPicker />
      </Section>

      {hasRoute && (
        <Section title="Route">
          <label className="field">
            <span>Colour by</span>
            <select value={design.route.colorBy} onChange={(e) => editRoute({ colorBy: e.target.value as RouteColorBy })}>
              <option value="solid">Solid</option>
              <option value="progress">Progress</option>
              {routeSeries.map((k) => <option key={k} value={k}>{SERIES_LABEL[k]}</option>)}
            </select>
          </label>
          <Slider label="Line weight" value={design.route.width} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(width) => editRoute({ width }, 'rw')} />
          <Slider label="Rotate" value={design.route.rotate} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(rotate) => editRoute({ rotate }, 'rr')} />
          <Toggle label="Start and finish markers" checked={design.route.markers} onChange={(markers) => editRoute({ markers })} />
          <Toggle label="Glow" checked={design.route.glow} onChange={(glow) => editRoute({ glow })} />
        </Section>
      )}

      {hasChart && (
        <Section title="Chart">
          <Segmented<SeriesKey | 'auto'> label="Chart data" value={design.chartSeries} onChange={(chartSeries) => edit({ chartSeries })}
            options={[{ value: 'auto', label: 'Auto' }, ...series.map((k) => ({ value: k, label: SERIES_LABEL[k].split(' ')[0] }))]} />
        </Section>
      )}

      <Section title="Layers" aside={<button className="link" onClick={resetLayout}>Reset layout</button>}>
        <p className="hint">Drag items on the canvas to move them. Use the corners to resize.</p>
        <ul className="layers">
          {layers.map((l) => (
            <li key={l.id} className={selected === l.id ? 'on' : ''}>
              <button onClick={() => select(l.id)}>{LAYER_NAMES[l.type]}</button>
              <Toggle label={`Show ${LAYER_NAMES[l.type]}`} checked={!l.hidden} onChange={(v) => editLayer(l.id, { hidden: !v })} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** Offers only weights the current fonts ship. Typefaces with a single weight get no control. */
function WeightPicker() {
  const design = useStudio((s) => s.design);
  const edit = useStudio((s) => s.edit);
  const type = resolveType({ ...design, fontWeight: null });
  const options = WEIGHT_CHOICES.filter((o) => supportsWeight(type.display, o.value) || supportsWeight(type.number, o.value));
  if (options.length < 2) return <p className="hint">No light or semibold weight for this typeface.</p>;
  return (
    <Segmented<number> label="Font weight" value={design.fontWeight ?? 0} onChange={(v) => edit({ fontWeight: v || null })}
      options={[{ value: 0, label: 'Default' }, ...options]} />
  );
}

export function ExportPanel() {
  const activity = useStudio(currentActivity);
  const design = useStudio((s) => s.design);
  const units = useStudio((s) => s.units);
  const photo = useStudio((s) => s.photo?.bitmap ?? null);
  const [opts, setOpts] = useState<ExportOptions>({ format: 'png', scale: 1 });
  const [status, setStatus] = useState('');
  const [W, H] = sceneSize(design.aspect, photo);

  const scene = { activity, design, units, photo };
  const ext = opts.format === 'jpeg' ? 'jpg' : 'png';
  const slug = (design.title ?? activity.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'activity';
  const fileName = `${slug}${opts.format === 'overlay' ? '-overlay' : ''}.${ext}`;

  const download = async () => {
    setStatus('Rendering…');
    try {
      const blob = await exportBlob(scene, opts);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(`Saved ${fileName}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const share = async () => {
    try {
      const blob = await exportBlob(scene, opts);
      const file = new File([blob], fileName, { type: blob.type });
      await navigator.share({ files: [file] });
      setStatus('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setStatus('Sharing failed. Download the image instead.');
    }
  };

  const copy = async () => {
    try {
      const blob = await exportBlob(scene, { ...opts, format: opts.format === 'jpeg' ? 'png' : opts.format });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('Copied to clipboard');
    } catch {
      setStatus('This browser blocked the copy. Download the image instead.');
    }
  };

  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });

  return (
    <>
      <Section title="Format">
        <Segmented<ExportOptions['format']> label="File format" value={opts.format} onChange={(format) => setOpts({ ...opts, format })}
          options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'overlay', label: 'Transparent' }]} />
        {opts.format === 'overlay' && <p className="hint">Only the overlay is saved, with no background, as a PNG.</p>}
      </Section>
      <Section title="Size">
        <Segmented<1 | 2> label="Export size" value={opts.scale} onChange={(scale) => setOpts({ ...opts, scale })}
          options={[{ value: 1, label: `${W} × ${H}` }, { value: 2, label: `${W * 2} × ${H * 2}` }]} />
      </Section>
      <Section title="Save">
        <button className="primary" onClick={download}>Download image</button>
        <div className="pair">
          {canShare && <button className="ghost" onClick={share}>Share</button>}
          <button className="ghost" onClick={copy}>Copy</button>
        </div>
        <p className="hint" role="status">{status}</p>
      </Section>
    </>
  );
}
