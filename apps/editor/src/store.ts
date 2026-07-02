import { create } from "zustand";
import { parse, serialize, type Design, type Item } from "@youzign/designstring";
import {
  patchItem,
  setTextColor,
  setShapeFill,
  createTextItem,
  createShapeItem,
  cloneItemForDuplicate,
  ensureUid,
  type ItemPatch,
  type ShapeKind,
  type WithUid,
} from "@youzign/editor-core";

const LS_PREFIX = "youzign-next:design:";

type IdItem = Item & WithUid;

function tagUids(design: Design): Design {
  for (const it of design.items) ensureUid(it as IdItem);
  return design;
}

/** Deep clone a design for the history stack. structuredClone preserves the
 *  raw attribute bag and per-item _uid, so serialize() stays valid. */
function snapshot(design: Design): Design {
  return structuredClone(design);
}

interface EditorState {
  design: Design;
  designName: string;
  selectedUid: number | null;
  editingUid: number | null; // text item currently in inline edit
  zoom: number;
  past: Design[];
  future: Design[];

  load: (xml: string, name: string) => void;
  setName: (name: string) => void;
  setZoom: (z: number) => void;
  select: (uid: number | null) => void;
  setEditing: (uid: number | null) => void;

  patchSelected: (patch: ItemPatch) => void;
  patchItemByUid: (uid: number, patch: ItemPatch) => void;
  beginHistory: () => void;
  livePatchByUid: (uid: number, patch: ItemPatch) => void;
  endGesture: () => void;
  recolorSelected: (hex: string) => void;
  setContentByUid: (uid: number, content: string) => void;

  addText: () => void;
  addShape: (kind: ShapeKind) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  bringToFront: () => void;
  sendToBack: () => void;

  undo: () => void;
  redo: () => void;

  selectedItem: () => IdItem | undefined;
}

function findByUid(design: Design, uid: number | null): IdItem | undefined {
  if (uid === null) return undefined;
  return design.items.find((i) => (i as IdItem)._uid === uid) as IdItem | undefined;
}

function persist(name: string, design: Design) {
  try {
    localStorage.setItem(LS_PREFIX + name, serialize(design));
  } catch {
    /* ignore quota / SSR */
  }
}

export const useEditor = create<EditorState>((set, get) => {
  /** Run a mutation with undo history + persistence. */
  const commit = (mutate: (d: Design) => void) => {
    set((s) => {
      const next = snapshot(s.design);
      mutate(next);
      persist(s.designName, next);
      return { design: next, past: [...s.past, s.design], future: [] };
    });
  };

  return {
    design: tagUids(parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>")),
    designName: "untitled",
    selectedUid: null,
    editingUid: null,
    zoom: 0.6,
    past: [],
    future: [],

    load: (xml, name) => {
      const design = tagUids(parse(xml));
      set({ design, designName: name, selectedUid: null, editingUid: null, past: [], future: [] });
    },

    setName: (name) => set({ designName: name }),
    setZoom: (z) => set({ zoom: z }),
    select: (uid) => set({ selectedUid: uid, editingUid: null }),
    setEditing: (uid) => set({ editingUid: uid }),

    patchSelected: (patch) => {
      const uid = get().selectedUid;
      if (uid === null) return;
      get().patchItemByUid(uid, patch);
    },

    patchItemByUid: (uid, patch) =>
      commit((d) => {
        const it = findByUid(d, uid);
        if (it) patchItem(it as any, patch);
      }),

    // Gesture (drag/resize/rotate) support: one undo step per gesture.
    beginHistory: () =>
      set((s) => ({ past: [...s.past, s.design], future: [] })),

    livePatchByUid: (uid, patch) =>
      set((s) => {
        const next = snapshot(s.design);
        const it = findByUid(next, uid);
        if (it) patchItem(it as any, patch);
        return { design: next };
      }),

    endGesture: () => {
      const s = get();
      persist(s.designName, s.design);
    },

    recolorSelected: (hex) => {
      const uid = get().selectedUid;
      if (uid === null) return;
      commit((d) => {
        const it = findByUid(d, uid);
        if (!it) return;
        if (it.type === "text" || it.type === "text-curved") setTextColor(it as any, hex);
        else if (it.type === "clipart") setShapeFill(it as any, hex);
      });
    },

    setContentByUid: (uid, content) =>
      commit((d) => {
        const it = findByUid(d, uid);
        if (it && (it.type === "text" || it.type === "text-curved")) {
          patchItem(it as any, { content });
        }
      }),

    addText: () => {
      const d0 = get().design;
      const item = createTextItem(d0, d0.canvasWidth / 2, d0.canvasHeight / 2) as IdItem;
      ensureUid(item);
      commit((d) => d.items.push(item));
      set({ selectedUid: item._uid! });
    },

    addShape: (kind) => {
      const d0 = get().design;
      const item = createShapeItem(d0, kind, d0.canvasWidth / 2, d0.canvasHeight / 2) as IdItem;
      ensureUid(item);
      commit((d) => d.items.push(item));
      set({ selectedUid: item._uid! });
    },

    duplicateSelected: () => {
      const uid = get().selectedUid;
      const orig = findByUid(get().design, uid);
      if (!orig) return;
      let newUid: number | null = null;
      commit((d) => {
        const src = findByUid(d, uid)!;
        const copy = cloneItemForDuplicate(d, src) as IdItem;
        newUid = copy._uid!;
        d.items.push(copy);
      });
      if (newUid !== null) set({ selectedUid: newUid });
    },

    deleteSelected: () => {
      const uid = get().selectedUid;
      if (uid === null) return;
      commit((d) => {
        d.items = d.items.filter((i) => (i as IdItem)._uid !== uid);
      });
      set({ selectedUid: null, editingUid: null });
    },

    nudgeSelected: (dx, dy) => {
      const it = get().selectedItem();
      if (!it || !("xpos" in it)) return;
      get().patchItemByUid(it._uid!, {
        xpos: (it as any).xpos + dx,
        ypos: (it as any).ypos + dy,
      });
    },

    bringToFront: () => {
      const uid = get().selectedUid;
      if (uid === null) return;
      commit((d) => {
        const maxI = d.items.reduce((m, it) => Math.max(m, (it as any).index ?? 0), 0);
        const it = findByUid(d, uid);
        if (it) patchItem(it as any, { index: maxI + 1 });
        d.items.sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0));
      });
    },

    sendToBack: () => {
      const uid = get().selectedUid;
      if (uid === null) return;
      commit((d) => {
        const minI = d.items.reduce((m, it) => Math.min(m, (it as any).index ?? 0), 0);
        const it = findByUid(d, uid);
        if (it) patchItem(it as any, { index: minI - 1 });
        d.items.sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0));
      });
    },

    undo: () =>
      set((s) => {
        if (s.past.length === 0) return s;
        const previous = s.past[s.past.length - 1];
        persist(s.designName, previous);
        return {
          design: previous,
          past: s.past.slice(0, -1),
          future: [s.design, ...s.future],
        };
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return s;
        const next = s.future[0];
        persist(s.designName, next);
        return { design: next, past: [...s.past, s.design], future: s.future.slice(1) };
      }),

    selectedItem: () => findByUid(get().design, get().selectedUid),
  };
});

export function localStorageKey(name: string) {
  return LS_PREFIX + name;
}
