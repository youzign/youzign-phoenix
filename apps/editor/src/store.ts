import { create } from "zustand";
import { removeBackground, BgRemovalError } from "./bg/removeBackground.js";
import { parse, serialize, type Design, type Item } from "@youzign/designstring";
import {
  patchItem,
  setTextColor,
  setShapeFill,
  setShapeNoFill,
  centerPatch,
  stepForward,
  stepBackward,
  applyOrder,
  type CenterAxis,
  setCurve,
  applyCrop,
  applySource,
  type CropResult,
  createTextItem,
  createShapeItem,
  createClipartItem,
  createImageItem,
  insertCombo,
  type ComboId,
  type TextPreset,
  type ShapePreset,
  fitToCanvas,
  resizeDesign,
  type ResizeOptions,
  setBackgroundColor,
  setTransparent,
  setGradientPreset,
  setGradientStop,
  setGradientLinear,
  setGradientAngle,
  setGradientRatios,
  reverseGradient,
  setBorderWidth,
  setBorderColor,
  cloneItemForDuplicate,
  ensureUid,
  toggleUid,
  normalizeSelection,
  type ItemPatch,
  type ShapeKind,
  type WithUid,
} from "@youzign/editor-core";

const LS_PREFIX = "youzign-next:design:";

/** Photo provenance kept in memory only — never written to the designstring. */
export interface PhotoAttribution {
  author: string;
  authorLink: string;
  link: string;
  provider: string;
}

type IdItem = Item & WithUid & { _attribution?: PhotoAttribution };

/** Recursively tag every item (incl. group children) with a stable _uid. */
function tagUids(design: Design): Design {
  const walk = (items: Item[]) => {
    for (const it of items) {
      ensureUid(it as IdItem);
      if (it.type === "group") walk(it.items);
    }
  };
  walk(design.items);
  return design;
}

/** Deep clone a design for the history stack. structuredClone preserves the
 *  raw attribute bag and per-item _uid, so serialize() stays valid. */
function snapshot(design: Design): Design {
  return structuredClone(design);
}

interface FindEntry {
  item: IdItem;
  siblings: Item[];
  parent: IdItem | null;
}

/** Recursively locate an item by uid, returning it plus its container array. */
function findEntry(design: Design, uid: number | null): FindEntry | undefined {
  if (uid === null) return undefined;
  const walk = (items: Item[], parent: IdItem | null): FindEntry | undefined => {
    for (const it of items) {
      if ((it as IdItem)._uid === uid) return { item: it as IdItem, siblings: items, parent };
      if (it.type === "group") {
        const hit = walk(it.items, it as IdItem);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(design.items, null);
}

function findByUid(design: Design, uid: number | null): IdItem | undefined {
  return findEntry(design, uid)?.item;
}

interface EditorState {
  design: Design;
  designName: string;
  selectedUids: number[];
  drillGroupUid: number | null; // the group we've drilled into (child selection)
  editingUid: number | null; // text item currently in inline edit
  croppingUid: number | null; // image item currently in crop mode
  bgProcessingUids: number[]; // image items whose background is being removed
  bgStage: string | null; // coarse progress stage of the active removal
  bgError: { uid: number; message: string } | null; // last removal failure
  zoom: number;
  past: Design[];
  future: Design[];

  load: (xml: string, name: string) => void;
  setName: (name: string) => void;
  setZoom: (z: number) => void;

  // selection
  select: (uid: number | null) => void;
  toggleSelect: (uid: number) => void;
  setSelection: (uids: number[]) => void;
  drillInto: (childUid: number, groupUid: number) => void;
  escapeSelection: () => void;
  setEditing: (uid: number | null) => void;

  patchSelected: (patch: ItemPatch) => void;
  patchItemByUid: (uid: number, patch: ItemPatch) => void;
  beginHistory: () => void;
  livePatchByUid: (uid: number, patch: ItemPatch) => void;
  livePatchMany: (patches: { uid: number; patch: ItemPatch }[]) => void;
  endGesture: () => void;
  recolorSelected: (hex: string) => void;
  setContentByUid: (uid: number, content: string) => void;
  setCurveByUid: (uid: number, amount: number) => void;

  // image crop mode
  beginCrop: (uid: number) => void;
  cancelCrop: () => void;
  commitCrop: (uid: number, bakedSource: string, geom: Pick<CropResult, "xpos" | "ypos" | "width" | "height">) => void;

  // background removal (local, in-worker)
  removeBg: (uid: number) => Promise<void>;
  clearBgError: () => void;

  addText: (preset?: TextPreset) => void;
  addShape: (kind: ShapeKind, preset?: ShapePreset) => void;
  addClipart: (source: string, opts?: { recolorable?: boolean }) => void;
  addCombo: (combo: ComboId) => void;
  addPhoto: (photo: {
    source: string;
    width: number;
    height: number;
    pixabay?: boolean;
    attribution?: PhotoAttribution;
    at?: { x: number; y: number };
  }) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  bringToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  reorderLayers: (orderedTopFirstUids: number[]) => void;
  centerSelected: (axis: CenterAxis) => void;
  toggleTextStyle: (attr: "bold" | "italic" | "underline" | "strikethrough") => void;
  setSelectedShapeNoFill: () => void;

  // lock (session-only — NEVER serialized; legacy XML never stored isLocked)
  lockedUids: number[];
  toggleLockSelected: () => void;
  toggleLockUid: (uid: number) => void;
  isLocked: (uid: number) => boolean;

  resize: (newW: number, newH: number, opts: ResizeOptions) => void;
  // canvas background (design-level attrs)
  setBgColor: (hex: string) => void;
  setBgTransparent: (transparent: boolean) => void;
  applyGradientPreset: (index: number) => void;
  setGradientStopColor: (which: 1 | 2, hex: string) => void;
  setGradientMode: (isLinear: boolean) => void;
  setBgGradientAngle: (angle: number) => void;
  setGradientRatio: (ratio1: number, ratio2: number) => void;
  reverseBgGradient: () => void;
  setCanvasBorderWidth: (width: number) => void;
  setCanvasBorderColor: (hex: string) => void;

  undo: () => void;
  redo: () => void;

  selectedItem: () => IdItem | undefined; // only when exactly one is selected
  selectedItems: () => IdItem[];
  findEntry: (uid: number) => FindEntry | undefined;
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
    selectedUids: [],
    drillGroupUid: null,
    editingUid: null,
    croppingUid: null,
    bgProcessingUids: [],
    bgStage: null,
    bgError: null,
    zoom: 0.6,
    past: [],
    future: [],
    lockedUids: [],

    load: (xml, name) => {
      const design = tagUids(parse(xml));
      set({ design, designName: name, selectedUids: [], drillGroupUid: null, editingUid: null, croppingUid: null, bgProcessingUids: [], bgStage: null, bgError: null, past: [], future: [], lockedUids: [] });
    },

    setName: (name) => set({ designName: name }),
    setZoom: (z) => set({ zoom: z }),

    select: (uid) =>
      set({ selectedUids: uid === null ? [] : [uid], drillGroupUid: null, editingUid: null, croppingUid: null }),
    toggleSelect: (uid) =>
      set((s) => ({ selectedUids: toggleUid(s.selectedUids, uid), drillGroupUid: null, editingUid: null })),
    setSelection: (uids) =>
      set({ selectedUids: normalizeSelection(uids), drillGroupUid: null, editingUid: null }),
    drillInto: (childUid, groupUid) =>
      set({ selectedUids: [childUid], drillGroupUid: groupUid, editingUid: null }),
    escapeSelection: () =>
      set((s) =>
        s.drillGroupUid !== null
          ? { selectedUids: [s.drillGroupUid], drillGroupUid: null, editingUid: null }
          : { selectedUids: [], drillGroupUid: null, editingUid: null }
      ),
    setEditing: (uid) => set({ editingUid: uid }),

    patchSelected: (patch) => {
      const uids = get().selectedUids;
      if (uids.length !== 1) return;
      get().patchItemByUid(uids[0], patch);
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

    livePatchMany: (patches) =>
      set((s) => {
        const next = snapshot(s.design);
        for (const { uid, patch } of patches) {
          const it = findByUid(next, uid);
          if (it) patchItem(it as any, patch);
        }
        return { design: next };
      }),

    endGesture: () => {
      const s = get();
      persist(s.designName, s.design);
    },

    recolorSelected: (hex) => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (!it) continue;
          if (it.type === "text" || it.type === "text-curved") setTextColor(it as any, hex);
          else if (it.type === "clipart") setShapeFill(it as any, hex);
        }
      });
    },

    setContentByUid: (uid, content) =>
      commit((d) => {
        const it = findByUid(d, uid);
        if (it && (it.type === "text" || it.type === "text-curved")) {
          patchItem(it as any, { content });
        }
      }),

    setCurveByUid: (uid, amount) =>
      commit((d) => {
        const it = findByUid(d, uid);
        if (it && it.type === "text-curved") setCurve(it as any, amount);
      }),

    beginCrop: (uid) => set({ croppingUid: uid, selectedUids: [uid], drillGroupUid: null, editingUid: null }),
    cancelCrop: () => set({ croppingUid: null }),
    commitCrop: (uid, bakedSource, geom) => {
      commit((d) => {
        const it = findByUid(d, uid);
        if (it && it.type === "image") applyCrop(it as any, bakedSource, geom);
      });
      set({ croppingUid: null });
    },

    removeBg: async (uid) => {
      const item = findByUid(get().design, uid);
      if (!item || item.type !== "image") return;
      const source = (item as any).source as string;
      if (get().bgProcessingUids.includes(uid)) return;
      set((s) => ({
        bgProcessingUids: [...s.bgProcessingUids, uid],
        bgStage: "load",
        bgError: null,
      }));
      try {
        const png = await removeBackground(source, {
          onStage: (stage) => set({ bgStage: stage }),
        });
        // Destructive source swap (same pattern as crop) with undo history.
        commit((d) => {
          const it = findByUid(d, uid);
          if (it && it.type === "image") applySource(it as any, png);
        });
      } catch (err) {
        const message =
          err instanceof BgRemovalError
            ? err.message
            : "Background removal failed on this device.";
        set({ bgError: { uid, message } });
      } finally {
        set((s) => ({
          bgProcessingUids: s.bgProcessingUids.filter((u) => u !== uid),
          bgStage: null,
        }));
      }
    },
    clearBgError: () => set({ bgError: null }),

    addText: (preset) => {
      const d0 = get().design;
      const item = createTextItem(d0, d0.canvasWidth / 2, d0.canvasHeight / 2, preset) as IdItem;
      ensureUid(item);
      commit((d) => d.items.push(item));
      set({ selectedUids: [item._uid!], drillGroupUid: null });
    },

    addShape: (kind, preset) => {
      const d0 = get().design;
      const item = createShapeItem(d0, kind, d0.canvasWidth / 2, d0.canvasHeight / 2, preset) as IdItem;
      ensureUid(item);
      commit((d) => d.items.push(item));
      set({ selectedUids: [item._uid!], drillGroupUid: null });
    },

    addClipart: (source, opts) => {
      const d0 = get().design;
      const box = fitToCanvas(d0, 200, 200, 0.35);
      const item = createClipartItem(d0, source, box.x, box.y, {
        width: box.width,
        height: box.height,
        recolorable: opts?.recolorable,
      }) as IdItem;
      ensureUid(item);
      commit((d) => d.items.push(item));
      set({ selectedUids: [item._uid!], drillGroupUid: null });
    },

    addCombo: (combo) => {
      const d0 = get().design;
      const items = insertCombo(d0, combo) as IdItem[];
      for (const it of items) ensureUid(it);
      commit((d) => {
        for (const it of items) d.items.push(it);
      });
      set({ selectedUids: items.map((it) => it._uid!), drillGroupUid: null });
    },

    addPhoto: ({ source, width, height, pixabay, attribution, at }) => {
      const d0 = get().design;
      const box = fitToCanvas(d0, width, height, 0.6);
      // Drag-drop onto the canvas: centre the item on the cursor (clamped in-canvas).
      const x = at ? Math.max(0, Math.min(at.x, d0.canvasWidth)) : box.x;
      const y = at ? Math.max(0, Math.min(at.y, d0.canvasHeight)) : box.y;
      const item = createImageItem(
        d0,
        source,
        x,
        y,
        { width: box.width, height: box.height },
        { pixabay }
      ) as IdItem;
      ensureUid(item);
      if (attribution) item._attribution = attribution;
      commit((d) => d.items.push(item));
      set({ selectedUids: [item._uid!], drillGroupUid: null });
    },

    duplicateSelected: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      const newUids: number[] = [];
      commit((d) => {
        for (const uid of uids) {
          const entry = findEntry(d, uid);
          if (!entry) continue;
          const copy = cloneItemForDuplicate(d, entry.item) as IdItem;
          newUids.push(copy._uid!);
          entry.siblings.push(copy);
        }
      });
      if (newUids.length) set({ selectedUids: newUids, drillGroupUid: null });
    },

    deleteSelected: () => {
      const locked = new Set(get().lockedUids);
      const uids = get().selectedUids.filter((u) => !locked.has(u));
      if (uids.length === 0) return;
      const set0 = new Set(uids);
      commit((d) => {
        for (const uid of uids) {
          const entry = findEntry(d, uid);
          if (!entry) continue;
          const i = entry.siblings.indexOf(entry.item);
          if (i >= 0) entry.siblings.splice(i, 1);
        }
      });
      set({ selectedUids: [], drillGroupUid: null, editingUid: null });
      void set0;
    },

    nudgeSelected: (dx, dy) => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      const d = get().design;
      const patches = uids
        .map((uid) => {
          const it = findByUid(d, uid);
          if (!it || !("xpos" in it)) return null;
          return { uid, patch: { xpos: (it as any).xpos + dx, ypos: (it as any).ypos + dy } };
        })
        .filter(Boolean) as { uid: number; patch: ItemPatch }[];
      if (!patches.length) return;
      commit((doc) => {
        for (const { uid, patch } of patches) {
          const it = findByUid(doc, uid);
          if (it) patchItem(it as any, patch);
        }
      });
    },

    bringToFront: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        let maxI = d.items.reduce((m, it) => Math.max(m, (it as any).index ?? 0), 0);
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (it && d.items.includes(it)) patchItem(it as any, { index: ++maxI });
        }
        d.items.sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0));
      });
    },

    sendToBack: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        let minI = d.items.reduce((m, it) => Math.min(m, (it as any).index ?? 0), 0);
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (it && d.items.includes(it)) patchItem(it as any, { index: --minI });
        }
        d.items.sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0));
      });
    },

    bringForward: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        const targets = uids
          .map((u) => findByUid(d, u))
          .filter((it) => it && d.items.includes(it)) as Item[];
        if (targets.length) stepForward(d, targets);
      });
    },

    sendBackward: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        const targets = uids
          .map((u) => findByUid(d, u))
          .filter((it) => it && d.items.includes(it)) as Item[];
        if (targets.length) stepBackward(d, targets);
      });
    },

    reorderLayers: (orderedTopFirstUids) => {
      commit((d) => {
        // Layers list is top-z-first; applyOrder wants back-to-front (ascending z).
        const ascending = [...orderedTopFirstUids].reverse();
        const ordered = ascending
          .map((u) => findByUid(d, u))
          .filter((it) => it && d.items.includes(it)) as Item[];
        if (ordered.length > 1) applyOrder(d, ordered);
      });
    },

    centerSelected: (axis) => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      const d0 = get().design;
      const patch = centerPatch(d0, axis);
      commit((d) => {
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (it && "xpos" in it) patchItem(it as any, patch);
        }
      });
    },

    toggleTextStyle: (attr) => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (it && (it.type === "text" || it.type === "text-curved")) {
            patchItem(it as any, { [attr]: !(it as any)[attr] });
          }
        }
      });
    },

    setSelectedShapeNoFill: () => {
      const uids = get().selectedUids;
      if (uids.length === 0) return;
      commit((d) => {
        for (const uid of uids) {
          const it = findByUid(d, uid);
          if (it && it.type === "clipart") setShapeNoFill(it as any);
        }
      });
    },

    toggleLockSelected: () =>
      set((s) => {
        const locked = new Set(s.lockedUids);
        for (const u of s.selectedUids) {
          if (locked.has(u)) locked.delete(u);
          else locked.add(u);
        }
        return { lockedUids: [...locked] };
      }),
    toggleLockUid: (uid) =>
      set((s) => ({
        lockedUids: s.lockedUids.includes(uid)
          ? s.lockedUids.filter((u) => u !== uid)
          : [...s.lockedUids, uid],
      })),
    isLocked: (uid) => get().lockedUids.includes(uid),

    resize: (newW, newH, opts) =>
      commit((d) => resizeDesign(d, newW, newH, opts)),
    setBgColor: (hex) => commit((d) => setBackgroundColor(d, hex)),
    setBgTransparent: (transparent) => commit((d) => setTransparent(d, transparent)),
    applyGradientPreset: (index) => commit((d) => setGradientPreset(d, index)),
    setGradientStopColor: (which, hex) => commit((d) => setGradientStop(d, which, hex)),
    setGradientMode: (isLinear) => commit((d) => setGradientLinear(d, isLinear)),
    setBgGradientAngle: (angle) => commit((d) => setGradientAngle(d, angle)),
    setGradientRatio: (ratio1, ratio2) => commit((d) => setGradientRatios(d, ratio1, ratio2)),
    reverseBgGradient: () => commit((d) => reverseGradient(d)),
    setCanvasBorderWidth: (width) => commit((d) => setBorderWidth(d, width)),
    setCanvasBorderColor: (hex) => commit((d) => setBorderColor(d, hex)),

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

    selectedItem: () => {
      const uids = get().selectedUids;
      return uids.length === 1 ? findByUid(get().design, uids[0]) : undefined;
    },
    selectedItems: () =>
      get()
        .selectedUids.map((u) => findByUid(get().design, u))
        .filter(Boolean) as IdItem[],
    findEntry: (uid) => findEntry(get().design, uid),
  };
});

export function localStorageKey(name: string) {
  return LS_PREFIX + name;
}

// Dev-only affordance: expose the store for screenshot/E2E scripts.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).__editor = useEditor;
}
