import { create } from 'zustand';
import type { Activity, Design, LayerOverride, Units } from '../types';
import { buildActivity } from '../lib/analyze';
import { loadActivities, removeActivity, saveActivity } from '../lib/db';
import { parseFit } from '../lib/fit';
import { sampleActivities } from '../lib/sample';
import { layerKey } from '../render/engine';
import { initialDesign, withTemplate } from '../render/templates';

export type Tab = 'activity' | 'template' | 'background' | 'overlay' | 'export';

interface Photo { bitmap: ImageBitmap; name: string }

interface State {
  activities: Activity[];
  activityId: string;
  design: Design;
  past: Design[];
  future: Design[];
  lastEdit: { key: string; at: number };
  units: Units;
  photo: Photo | null;
  selected: string | null;
  tab: Tab;
  safeZones: boolean;
  errors: string[];
  busy: boolean;

  setTab: (t: Tab) => void;
  select: (id: string | null) => void;
  setUnits: (u: Units) => void;
  toggleSafeZones: () => void;
  edit: (patch: Partial<Design>, group?: string) => void;
  editBackground: (patch: Partial<Design['background']>, group?: string) => void;
  editRoute: (patch: Partial<Design['route']>, group?: string) => void;
  editLayer: (id: string, patch: LayerOverride, group?: string) => void;
  resetLayout: () => void;
  useTemplate: (id: string) => void;
  undo: () => void;
  redo: () => void;
  chooseActivity: (id: string) => void;
  deleteActivity: (id: string) => void;
  uploadFit: (files: File[]) => Promise<void>;
  setPhoto: (file: File) => Promise<void>;
  clearPhoto: () => void;
  dismissErrors: () => void;
  hydrate: () => Promise<void>;
}

const samples = sampleActivities();
const SAVED = 'activity-in-frame:v1';

function restore(): { design: Design; units: Units } {
  const fallback = { design: initialDesign(), units: 'metric' as Units };
  try {
    const raw = localStorage.getItem(SAVED);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    const design: Design = { ...fallback.design, ...saved.design };
    // Photos are not stored, so a saved photo design falls back to its template's look.
    if (design.background.kind === 'photo') return { design: withTemplate({ ...design, background: fallback.design.background }, design.templateId), units: saved.units ?? 'metric' };
    return { design, units: saved.units ?? 'metric' };
  } catch {
    return fallback;
  }
}

const start = restore();

export const useStudio = create<State>((set, get) => {
  /** Rapid edits in one group, like a slider drag, collapse into a single undo step. */
  const apply = (next: Design, group?: string) => {
    const { design, past, lastEdit } = get();
    const now = Date.now();
    const merge = !!group && group === lastEdit.key && now - lastEdit.at < 700;
    set({
      design: next,
      past: merge ? past : [...past.slice(-59), design],
      future: [],
      lastEdit: { key: group ?? '', at: now },
    });
  };

  return {
    activities: samples,
    activityId: samples[0].id,
    design: start.design,
    past: [],
    future: [],
    lastEdit: { key: '', at: 0 },
    units: start.units,
    photo: null,
    selected: null,
    tab: 'activity',
    safeZones: false,
    errors: [],
    busy: false,

    setTab: (tab) => set({ tab }),
    select: (selected) => set({ selected }),
    setUnits: (units) => set({ units }),
    toggleSafeZones: () => set((s) => ({ safeZones: !s.safeZones })),
    edit: (patch, group) => apply({ ...get().design, ...patch }, group),
    editBackground: (patch, group) => {
      const d = get().design;
      apply({ ...d, background: { ...d.background, ...patch } }, group);
    },
    editRoute: (patch, group) => {
      const d = get().design;
      apply({ ...d, route: { ...d.route, ...patch } }, group);
    },
    editLayer: (id, patch, group) => {
      const d = get().design;
      const key = layerKey(d, id);
      apply({ ...d, layout: { ...d.layout, [key]: { ...d.layout[key], ...patch } } }, group);
    },
    resetLayout: () => {
      const d = get().design;
      const prefix = `${d.templateId}:${d.aspect}:`;
      apply({ ...d, layout: Object.fromEntries(Object.entries(d.layout).filter(([k]) => !k.startsWith(prefix))) });
    },
    useTemplate: (id) => {
      set({ selected: null });
      apply(withTemplate(get().design, id));
    },
    undo: () => {
      const { past, design, future } = get();
      if (!past.length) return;
      set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future], lastEdit: { key: '', at: 0 } });
    },
    redo: () => {
      const { past, design, future } = get();
      if (!future.length) return;
      set({ design: future[0], future: future.slice(1), past: [...past, design], lastEdit: { key: '', at: 0 } });
    },
    chooseActivity: (activityId) => set({ activityId }),
    deleteActivity: (id) => {
      void removeActivity(id).catch(() => {});
      const left = get().activities.filter((a) => a.id !== id);
      set({ activities: left, activityId: get().activityId === id ? left[0].id : get().activityId });
    },
    uploadFit: async (files) => {
      set({ busy: true, errors: [] });
      const errors: string[] = [];
      let newest: string | null = null;
      for (const file of files) {
        try {
          const raw = parseFit(await file.arrayBuffer());
          const id = `fit-${file.name}-${file.size}-${raw.start ?? 0}`;
          const a = buildActivity(raw, { id, source: 'file', fallbackName: file.name.replace(/\.fit$/i, '').replace(/[_-]+/g, ' ') });
          void saveActivity(a).catch(() => {});
          set((s) => ({ activities: [a, ...s.activities.filter((x) => x.id !== id)] }));
          newest = id;
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof RangeError ? 'the file is cut off or damaged.' : (e as Error).message}`);
        }
      }
      set({ busy: false, errors, ...(newest ? { activityId: newest } : {}) });
    },
    setPhoto: async (file) => {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        get().photo?.bitmap.close();
        set({ photo: { bitmap, name: file.name }, errors: [] });
        const d = get().design;
        const next = { ...d, background: { ...d.background, kind: 'photo' as const, zoom: 1, panX: 0, panY: 0 } };
        // Only the ink follows the photo. Fonts and layout choices stay as the user set them.
        const { ink, accent } = withTemplate(next, d.templateId);
        apply({ ...next, ink, accent });
      } catch {
        set({ errors: [`${file.name}: this browser cannot open that image. Try a JPG or PNG.`] });
      }
    },
    clearPhoto: () => {
      const d = get().design;
      get().photo?.bitmap.close();
      set({ photo: null });
      const { ink, accent, background } = withTemplate({ ...d, background: { ...d.background, kind: 'solid' } }, d.templateId);
      apply({ ...d, ink, accent, background, aspect: d.aspect === 'photo' ? '4:5' : d.aspect });
    },
    dismissErrors: () => set({ errors: [] }),
    hydrate: async () => {
      try {
        const saved = await loadActivities();
        if (!saved.length) return;
        saved.sort((a, b) => b.start - a.start);
        set({ activities: [...saved, ...samples], activityId: saved[0].id });
      } catch {
        // Private windows can block IndexedDB. Uploads still work for the session.
      }
    },
  };
});

useStudio.subscribe((s, prev) => {
  if (s.design === prev.design && s.units === prev.units) return;
  try {
    localStorage.setItem(SAVED, JSON.stringify({ design: s.design, units: s.units }));
  } catch {
    // Storage may be unavailable. Designs then simply last for the session.
  }
});

export const currentActivity = (s: State) => s.activities.find((a) => a.id === s.activityId) ?? s.activities[0];
