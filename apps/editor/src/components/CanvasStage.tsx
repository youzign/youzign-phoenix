import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as RDragEvent, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from "react";
import { DesignCanvas } from "@youzign/renderer";
import {
  itemBox,
  childBoxInCanvas,
  combinedBox,
  boxIntersectsRect,
  boxAABB,
  computeCrop,
  canvasRectToFullSourceRect,
  currentCropCanvasRect,
  resizeCorner,
  resizeEdge,
  resizeTextCorner,
  resizeTextSide,
  edgeCropRect,
  HANDLE_SIGN,
  fullSourceCanvasBounds,
  fullSourceRectToCanvasGeom,
  snapRotation,
  resolveSnap,
  canvasTargets,
  itemTargets,
  gridTargets,
  mergeTargets,
  type SelBox,
  type SnapLines,
  type SnapState,
  type Corner,
  type Edge,
  type CropRect,
  type ImageCropMemory,
} from "@youzign/editor-core";
import type { Design, ImageItem, Item, TextItem } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { ingestFiles } from "../library/uploads.js";
import { Icon } from "./ui.js";
import { loadImage, strokesToMaskDataUri, hasStrokes, type Stroke } from "../magic/raster.js";
import { PageStrip } from "./PageStrip.js";

type IdItem = Item & { _uid?: number };

/** Grid: 8px minor / 64px major (canvas units). Snap threshold ~6px screen. */
const GRID_MINOR = 8;
const GRID_MAJOR = 64;
const SNAP_PX = 6;
const TEXT_CHROME_OUTSET_PX = 6;

type HandleId = Corner | Edge;
const EDGES: Edge[] = ["n", "s", "e", "w"];

interface Drag {
  mode: "move" | "resize" | "rotate" | "cropEdge";
  handle?: HandleId;
  startBox: SelBox;
  startCanvas: { x: number; y: number };
  uid: number;
  // for multi-move: starting positions of every moved item
  moveStarts?: { uid: number; xpos: number; ypos: number }[];
  // smart-snap state (move only)
  movingBox0?: SelBox; // combined selection AABB at gesture start
  snapTargets?: SnapLines;
  engaged?: SnapState;
  // image edge-crop
  imageItem?: ImageItem;
  fullNatural?: { w: number; h: number };
  // text resize starts from the original model values for stable live preview
  textItem?: TextItem;
  // Canvas-space handle anchor at gesture start. Resize math receives this
  // virtual pointer plus drag delta so off-center grabs do not resize on grab.
  handleStart?: { x: number; y: number };
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Find a top-level group by uid (for drill hit-testing). */
function findGroup(design: Design, uid: number): (IdItem & { items: Item[] }) | undefined {
  const g = design.items.find((i) => (i as IdItem)._uid === uid);
  return g && g.type === "group" ? (g as any) : undefined;
}

/** Recursively find an item + its containing group (if any) by uid. */
function locate(
  design: Design,
  uid: number
): { item: IdItem; group: IdItem | null } | undefined {
  for (const it of design.items) {
    if ((it as IdItem)._uid === uid) return { item: it as IdItem, group: null };
    if (it.type === "group") {
      for (const c of it.items) {
        if ((c as IdItem)._uid === uid) return { item: c as IdItem, group: it as IdItem };
      }
    }
  }
  return undefined;
}

/** Canvas-space selection box for any uid (handles group children). */
function canvasBoxOf(design: Design, uid: number): SelBox | undefined {
  const loc = locate(design, uid);
  if (!loc) return undefined;
  const local = itemBox(loc.item as any);
  return loc.group ? childBoxInCanvas(loc.group as any, local) : local;
}

function rotateOffset(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function handleAnchor(box: SelBox, handle: HandleId): { x: number; y: number } {
  const [sx, sy] = HANDLE_SIGN[handle];
  const offset = rotateOffset((sx * box.w) / 2, (sy * box.h) / 2, box.rotation);
  return { x: box.cx + offset.x, y: box.cy + offset.y };
}

function paddedChromeBox(box: SelBox, outset: number): SelBox {
  return { ...box, w: box.w + outset * 2, h: box.h + outset * 2 };
}

function textResizeSnapshot(item: TextItem, box: SelBox, handle?: HandleId): TextItem {
  const snapshot = { ...item } as TextItem;
  if ((handle === "e" || handle === "w") && !item.wrapping) {
    const width = Math.max(1, box.w);
    const localCenter = rotateOffset(box.cx - item.xpos, box.cy - item.ypos, -item.rotation);
    const worldCenter = rotateOffset(localCenter.x, 0, item.rotation);
    snapshot.xpos = item.xpos + worldCenter.x;
    snapshot.ypos = item.ypos + worldCenter.y;
    snapshot.textAreaWidth = width;
    snapshot.mcWidth = width;
    snapshot.textAreaxpos = -width / 2;
  }
  return snapshot;
}

export function CanvasStage() {
  const design = useEditor((s) => s.design);
  const zoom = useEditor((s) => s.zoom);
  const showGrid = useEditor((s) => s.showGrid);
  const selectedUids = useEditor((s) => s.selectedUids);
  const drillGroupUid = useEditor((s) => s.drillGroupUid);
  const editingUid = useEditor((s) => s.editingUid);
  const select = useEditor((s) => s.select);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const setSelection = useEditor((s) => s.setSelection);
  const drillInto = useEditor((s) => s.drillInto);
  const setEditing = useEditor((s) => s.setEditing);
  const beginHistory = useEditor((s) => s.beginHistory);
  const livePatch = useEditor((s) => s.livePatchByUid);
  const livePatchMany = useEditor((s) => s.livePatchMany);
  const endGesture = useEditor((s) => s.endGesture);
  const setContentByUid = useEditor((s) => s.setContentByUid);
  const croppingUid = useEditor((s) => s.croppingUid);
  const magicMode = useEditor((s) => s.magicMode);
  const magicUid = useEditor((s) => s.magicUid);
  const magicBusy = useEditor((s) => s.magicBusy);
  const cancelMagic = useEditor((s) => s.cancelMagic);
  const applyMagicErase = useEditor((s) => s.applyMagicErase);
  const applyMagicEdit = useEditor((s) => s.applyMagicEdit);
  const applyMagicGrab = useEditor((s) => s.applyMagicGrab);
  const blurPreview = useEditor((s) => s.blurPreview);
  const applyMagicBlur = useEditor((s) => s.applyMagicBlur);
  const cancelMagicBlur = useEditor((s) => s.cancelMagicBlur);
  const bgProcessingUids = useEditor((s) => s.bgProcessingUids);
  const cancelCrop = useEditor((s) => s.cancelCrop);
  const commitCrop = useEditor((s) => s.commitCrop);
  const addPhoto = useEditor((s) => s.addPhoto);
  const lockedUids = useEditor((s) => s.lockedUids);
  const isLocked = (uid: number) => lockedUids.includes(uid);

  const [fileOver, setFileOver] = useState(false);

  // Selection chrome is measured via canvas measureText, which reports
  // fallback-font metrics until the webfont actually arrives. WebKit is doubly
  // treacherous: fonts.check() returns true before the face is usable AND
  // loadingdone never fires for stylesheet-loaded faces. So actively
  // fonts.load() every face the design's text uses and re-render once each
  // resolves — otherwise the chrome hugs stale bounds until the first gesture
  // and visibly "jumps" when grabbed.
  const [, setFontsTick] = useState(0);
  const loadedFontSpecs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (!fonts?.load) return;
    let cancelled = false;
    const pending: string[] = [];
    const walk = (items: Item[]) => {
      for (const it of items) {
        if (it.type === "group") walk((it as { items: Item[] } & Item).items);
        else if (it.type === "text" || it.type === "text-curved") {
          const t = it as TextItem;
          const spec = `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} 16px "${t.font}"`;
          if (!loadedFontSpecs.current.has(spec)) {
            loadedFontSpecs.current.add(spec);
            pending.push(spec);
          }
        }
      }
    };
    walk(design.items as Item[]);
    if (!pending.length) return;
    Promise.all(pending.map((s) => fonts.load(s).catch(() => null))).then(() => {
      if (!cancelled) setFontsTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [design]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const inlineCommitRef = useRef<(() => void) | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [guides, setGuides] = useState<SnapLines>({ v: [], h: [] });
  const [liveCrop, setLiveCrop] = useState<CropRect | null>(null);
  const [rotHud, setRotHud] = useState<
    { deg: number; left: number; top: number; strong: boolean } | null
  >(null);
  const [, force] = useState(0);

  const w = design.canvasWidth * zoom;
  const h = design.canvasHeight * zoom;

  const toCanvas = (clientX: number, clientY: number) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  const single = selectedUids.length === 1 ? selectedUids[0] : null;
  const selectedIsTopLevel = single !== null && drillGroupUid === null;

  useEffect(() => {
    if (editingUid === null) {
      inlineCommitRef.current = null;
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-inline-text-editor='true']")) return;
      inlineCommitRef.current?.();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [editingUid]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // marquee
      if (marqueeRef.current) {
        const p = toCanvas(e.clientX, e.clientY);
        setMarquee({ x0: marqueeRef.current.x0, y0: marqueeRef.current.y0, x1: p.x, y1: p.y });
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const p = toCanvas(e.clientX, e.clientY);
      const b = d.startBox;
      const shift = e.shiftKey;

      if (d.mode === "move") {
        let dx = p.x - d.startCanvas.x;
        let dy = p.y - d.startCanvas.y;
        // Smart snapping (Alt/Option disables it while held).
        if (!e.altKey && d.movingBox0 && d.snapTargets) {
          const mv = {
            ...d.movingBox0,
            cx: d.movingBox0.cx + dx,
            cy: d.movingBox0.cy + dy,
          };
          const snap = resolveSnap(mv, d.snapTargets, {
            threshold: SNAP_PX / zoom,
            engaged: d.engaged,
          });
          dx += snap.dx;
          dy += snap.dy;
          d.engaged = snap.engaged;
          setGuides(snap.guides);
        } else {
          d.engaged = { v: null, h: null };
          setGuides({ v: [], h: [] });
        }
        if (d.moveStarts && d.moveStarts.length) {
          livePatchMany(
            d.moveStarts.map((s) => ({
              uid: s.uid,
              patch: { xpos: s.xpos + dx, ypos: s.ypos + dy },
            }))
          );
        }
      } else if (d.mode === "rotate") {
        const ang = (Math.atan2(p.y - b.cy, p.x - b.cx) * 180) / Math.PI + 90;
        // Auto-snap to 45° guides by default; Ctrl/Cmd = fine (no snap);
        // Shift = 15° stepper.
        const snap = snapRotation(ang, {
          fine: e.ctrlKey || e.metaKey,
          step: shift,
        });
        livePatch(d.uid, { rotation: snap.angle });
        // Degree readout pill positioned near the cursor (overlay-relative px).
        const r = overlayRef.current?.getBoundingClientRect();
        if (r) {
          setRotHud({
            deg: Math.round(snap.angle),
            left: e.clientX - r.left + 16,
            top: e.clientY - r.top - 28,
            strong: snap.snapped && snap.strong,
          });
        }
      } else if (d.mode === "cropEdge" && d.handle && d.imageItem) {
        const mem = d.imageItem as ImageCropMemory;
        const bounds =
          mem._fullSource && mem._cropRect && d.fullNatural
            ? fullSourceCanvasBounds(d.imageItem, mem._cropRect, d.fullNatural.w, d.fullNatural.h)
            : undefined;
        setLiveCrop(edgeCropRect(d.imageItem, d.handle as Edge, p, 8, bounds));
      } else if (d.mode === "resize" && d.handle) {
        const isCorner = d.handle.length === 2;
        const virtual =
          d.handleStart && isCorner
            ? {
                x: d.handleStart.x + (p.x - d.startCanvas.x),
                y: d.handleStart.y + (p.y - d.startCanvas.y),
              }
            : p;
        const patch = d.textItem
          ? isCorner
            ? resizeTextCorner(d.textItem, b, d.handle as Corner, virtual)
            : resizeTextSide(d.textItem, d.handle as "e" | "w", d.startCanvas, p)
          : isCorner
            // Corner: proportional BY DEFAULT, Shift unlocks free resize (Canva).
            // Edge: single-axis stretch.
            ? resizeCorner(b, d.handle as Corner, virtual, !shift)
            : resizeEdge(
                b,
                d.handle as Edge,
                d.handleStart
                  ? {
                      x: d.handleStart.x + (p.x - d.startCanvas.x),
                      y: d.handleStart.y + (p.y - d.startCanvas.y),
                    }
                  : p
              );
        livePatch(d.uid, patch);
      }
    };
    const onUp = () => {
      if (marqueeRef.current) {
        const m = marquee;
        marqueeRef.current = null;
        if (m) {
          const rx = Math.min(m.x0, m.x1);
          const ry = Math.min(m.y0, m.y1);
          const rw = Math.abs(m.x1 - m.x0);
          const rh = Math.abs(m.y1 - m.y0);
          if (rw > 3 || rh > 3) {
            const rect = { x: rx, y: ry, w: rw, h: rh };
            const hits = (design.items as IdItem[])
              .filter((it) => it.type !== "filter")
              .filter((it) => boxIntersectsRect(itemBox(it as any), rect))
              .map((it) => it._uid!)
              .filter((u) => u !== undefined);
            setSelection(hits);
          } else {
            select(null);
          }
        }
        setMarquee(null);
        force((n) => n + 1);
        return;
      }
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setGuides({ v: [], h: [] });
        setRotHud(null);
        if (d.mode === "cropEdge") {
          // Bake the edge-crop into a new image (destructive, like crop mode).
          const rect = liveCrop;
          setLiveCrop(null);
          if (d.imageItem && rect) {
            bakeImageCrop(d.imageItem, rect, (src, geom, memory) =>
              commitCrop(d.uid, src, geom, memory)
            );
          }
          // No endGesture(): commitCrop owns the history step.
          force((n) => n + 1);
          return;
        }
        endGesture();
        force((n) => n + 1);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape cancels an in-progress edge-crop drag.
      if (e.key === "Escape" && dragRef.current?.mode === "cropEdge") {
        e.preventDefault();
        dragRef.current = null;
        setLiveCrop(null);
        setGuides({ v: [], h: [] });
        force((n) => n + 1);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, marquee, design, liveCrop]);

  // Blur preview: Enter bakes, Escape cancels.
  useEffect(() => {
    if (!blurPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); applyMagicBlur(); }
      if (e.key === "Escape") { e.preventDefault(); cancelMagicBlur(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [blurPreview, applyMagicBlur, cancelMagicBlur]);

  const startMove = (e: RPointerEvent, uids: number[]) => {
    e.stopPropagation();
    // Locked items can be selected but never translated.
    const movable = uids.filter((u) => !isLocked(u));
    if (movable.length === 0) return;
    beginHistory();
    const moveStarts = movable
      .map((uid) => {
        const loc = locate(design, uid);
        if (!loc || !("xpos" in loc.item)) return null;
        return { uid, xpos: (loc.item as any).xpos, ypos: (loc.item as any).ypos };
      })
      .filter(Boolean) as { uid: number; xpos: number; ypos: number }[];
    // Combined AABB of the moving selection + snap targets (other items, canvas,
    // grid) computed once at gesture start.
    const movingBoxes = uids
      .map((u) => canvasBoxOf(design, u))
      .filter(Boolean) as SelBox[];
    const movingBox0 = combinedBox(movingBoxes) ?? undefined;
    const movingSet = new Set(uids);
    const otherBoxes = (design.items as IdItem[])
      .filter((it) => it.type !== "filter" && !movingSet.has(it._uid!))
      .map((it) => itemBox(it as any));
    const snapTargets = mergeTargets(
      canvasTargets(design.canvasWidth, design.canvasHeight),
      itemTargets(otherBoxes),
      showGrid ? gridTargets(design.canvasWidth, design.canvasHeight, GRID_MINOR) : { v: [], h: [] }
    );
    dragRef.current = {
      mode: "move",
      startBox: { cx: 0, cy: 0, w: 0, h: 0, rotation: 0 },
      startCanvas: toCanvas(e.clientX, e.clientY),
      uid: movable[0],
      moveStarts,
      movingBox0,
      snapTargets,
      engaged: { v: null, h: null },
    };
  };

  const startTransform = (
    e: RPointerEvent,
    uid: number,
    mode: "resize" | "rotate",
    handle?: HandleId
  ) => {
    e.stopPropagation();
    if (isLocked(uid)) return; // locked items can't be resized/rotated
    const box = canvasBoxOf(design, uid);
    if (!box) return;
    // Image edge handles CROP (Canva); everything else resizes.
    const loc = locate(design, uid);
    const isImage = loc?.item.type === "image";
    const isPlainText = loc?.item.type === "text";
    const isEdge = handle !== undefined && handle.length === 1;
    if (mode === "resize" && isEdge && isImage) {
      const imageItem = loc!.item as unknown as ImageItem;
      dragRef.current = {
        mode: "cropEdge",
        handle,
        startBox: box,
        startCanvas: toCanvas(e.clientX, e.clientY),
        uid,
        imageItem,
      };
      setLiveCrop(null);
      const mem = imageItem as ImageCropMemory;
      if (mem._fullSource && mem._cropRect) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const d = dragRef.current;
          if (d?.mode === "cropEdge" && d.imageItem === imageItem) {
            d.fullNatural = { w: img.naturalWidth || imageItem.width, h: img.naturalHeight || imageItem.height };
          }
        };
        img.src = mem._fullSource;
      }
      return;
    }
    beginHistory();
    const startCanvas = toCanvas(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      handle,
      startBox: box,
      startCanvas,
      uid,
      handleStart: mode === "resize" && handle ? handleAnchor(box, handle) : undefined,
      textItem:
        isPlainText && mode === "resize"
          ? textResizeSnapshot(loc!.item as TextItem, box, handle)
          : undefined,
    };
  };

  const onItemPointerDown = (e: RPointerEvent, uid: number) => {
    if (e.shiftKey) {
      e.stopPropagation();
      toggleSelect(uid);
      return;
    }
    // If drilled into a group and this top-level item isn't the group, pop up.
    if (selectedUids.includes(uid)) {
      // keep current (possibly multi) selection and move it as a group
      startMove(e, selectedUids);
    } else {
      select(uid);
      startMove(e, [uid]);
    }
  };

  const onItemDoubleClick = (e: RMouseEvent, item: IdItem) => {
    e.stopPropagation();
    const uid = item._uid!;
    if (item.type === "text" || item.type === "text-curved") {
      select(uid);
      setEditing(uid);
      return;
    }
    if (item.type === "group") {
      // Drill into the topmost child under the cursor.
      const group = findGroup(design, uid);
      if (!group) return;
      const p = toCanvas(e.clientX, e.clientY);
      const children = [...group.items].sort(
        (a, b) => ((b as any).index ?? 0) - ((a as any).index ?? 0)
      );
      for (const c of children) {
        const cb = childBoxInCanvas(group as any, itemBox(c as any));
        if (
          p.x >= cb.cx - cb.w / 2 &&
          p.x <= cb.cx + cb.w / 2 &&
          p.y >= cb.cy - cb.h / 2 &&
          p.y <= cb.cy + cb.h / 2
        ) {
          drillInto((c as IdItem)._uid!, uid);
          return;
        }
      }
      // Fallback: drill into first child.
      if (group.items.length) drillInto((group.items[0] as IdItem)._uid!, uid);
    }
  };

  const items = design.items as IdItem[];

  // Combined selection box (canvas space).
  const selBoxes = selectedUids
    .map((u) => canvasBoxOf(design, u))
    .filter(Boolean) as SelBox[];
  const comboBox = combinedBox(selBoxes);
  const singleBox = single !== null ? canvasBoxOf(design, single) : null;
  const singleItem = single !== null ? locate(design, single)?.item : undefined;
  const isText =
    singleItem && (singleItem.type === "text" || singleItem.type === "text-curved");
  const isPlainText = singleItem?.type === "text";

  const boxToStyle = (box: SelBox): CSSProperties => ({
    position: "absolute",
    left: (box.cx - box.w / 2) * zoom,
    top: (box.cy - box.h / 2) * zoom,
    width: box.w * zoom,
    height: box.h * zoom,
    transform: `rotate(${box.rotation}deg)`,
    transformOrigin: "center center",
  });

  const isFileDrag = (e: RDragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  const onCanvasDrop = async (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setFileOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    // Map drop point to canvas space (centred on cursor) before the async read.
    const at = toCanvas(e.clientX, e.clientY);
    const recs = await ingestFiles(files);
    recs.forEach((r, i) =>
      addPhoto({
        source: r.dataUri,
        width: r.width,
        height: r.height,
        at: { x: at.x + i * 16, y: at.y + i * 16 },
      })
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#141417]">
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-10"
        onDragEnter={(e) => {
          if (isFileDrag(e)) {
            e.preventDefault();
            setFileOver(true);
          }
        }}
        onDragOver={(e) => {
          if (isFileDrag(e)) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setFileOver(false);
        }}
        onDrop={(e) => void onCanvasDrop(e)}
      >
      <div
        className="relative shadow-2xl ring-1 ring-white/[0.06]"
        style={{
          width: w,
          height: h,
          ...(design.transparent
            ? {
                backgroundColor: "#fff",
                backgroundImage:
                  "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }
            : null),
          outline: fileOver ? "2px dashed var(--accent)" : undefined,
          outlineOffset: fileOver ? "6px" : undefined,
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <DesignCanvas design={design} zoom={zoom} />
        </div>

        {/* grid overlay (toggle: G / TopBar) — 8px minor / 64px major */}
        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)," +
                "linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)," +
                "linear-gradient(to right, rgba(255,255,255,0.10) 1px, transparent 1px)," +
                "linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px)",
              backgroundSize:
                `${GRID_MINOR * zoom}px ${GRID_MINOR * zoom}px,` +
                `${GRID_MINOR * zoom}px ${GRID_MINOR * zoom}px,` +
                `${GRID_MAJOR * zoom}px ${GRID_MAJOR * zoom}px,` +
                `${GRID_MAJOR * zoom}px ${GRID_MAJOR * zoom}px`,
            }}
          />
        )}

        {/* interaction overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ width: w, height: h }}
          onPointerDown={(e) => {
            if (croppingUid !== null || magicMode !== null) return; // crop/magic own interaction
            // marquee start on empty canvas
            const p = toCanvas(e.clientX, e.clientY);
            marqueeRef.current = { x0: p.x, y0: p.y };
            setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
        >
          {/* per-item hit areas (topmost index wins via DOM order) */}
          {croppingUid === null && magicMode === null && [...items]
            .filter((it) => it.type !== "filter")
            .sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0))
            .map((item) => {
              const box = itemBox(item as any);
              const uid = item._uid!;
              return (
                <div
                  key={uid}
                  style={{ ...boxToStyle(box), cursor: isLocked(uid) ? "default" : "move" }}
                  onPointerDown={(e) => onItemPointerDown(e, uid)}
                  onDoubleClick={(e) => onItemDoubleClick(e, item)}
                />
              );
            })}

          {/* multi-select combined box (no handles) */}
          {selectedUids.length > 1 && comboBox && (
            <div style={{ ...boxToStyle(comboBox), pointerEvents: "none" }}>
              <div
                className="absolute inset-0"
                style={{ outline: "1.5px dashed #6366f1", outlineOffset: 0 }}
              />
              {/* thin outline per member */}
            </div>
          )}
          {selectedUids.length > 1 &&
            selBoxes.map((b, i) => (
              <div key={i} style={{ ...boxToStyle(b), pointerEvents: "none" }}>
                <div
                  className="absolute inset-0"
                  style={{ outline: "1px solid rgba(99,102,241,0.55)" }}
                />
              </div>
            ))}

          {/* single-select chrome */}
          {croppingUid === null &&
            magicMode === null &&
            single !== null &&
            singleBox &&
            editingUid !== single &&
            (() => {
              // Friendly, rounded selection chrome (per owner: less boxy/sharp
              // than Dezygn). Handles have a large invisible hit area with a
              // smaller rounded visual + subtle shadow.
              const POS: Record<HandleId, CSSProperties> = {
                nw: { left: 0, top: 0 },
                ne: { left: "100%", top: 0 },
                se: { left: "100%", top: "100%" },
                sw: { left: 0, top: "100%" },
                n: { left: "50%", top: 0 },
                s: { left: "50%", top: "100%" },
                e: { left: "100%", top: "50%" },
                w: { left: 0, top: "50%" },
              };
              const CURSOR: Record<HandleId, string> = {
                nw: "nwse-resize",
                se: "nwse-resize",
                ne: "nesw-resize",
                sw: "nesw-resize",
                n: "ns-resize",
                s: "ns-resize",
                e: "ew-resize",
                w: "ew-resize",
              };
              const corners: HandleId[] = ["nw", "ne", "se", "sw"];
              const textSides: HandleId[] = ["e", "w"];
              const nonTextEdges: HandleId[] = EDGES;
              // Resize/rotate handles only for a single TOP-LEVEL item.
              const locked = single !== null && isLocked(single);
              const showHandles = selectedIsTopLevel && (!isText || isPlainText) && !locked;
              const showRotate = selectedIsTopLevel && !locked;
              const isImageSel = singleItem?.type === "image";
              const chromeBox = isText
                ? paddedChromeBox(singleBox, TEXT_CHROME_OUTSET_PX / zoom)
                : singleBox;
              const handleFill: CSSProperties = {
                background: "#fff",
                border: "1.5px solid var(--accent)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
              };
              const handleVisual = (id: HandleId): CSSProperties => {
                if (id === "n" || id === "s") {
                  return { ...handleFill, width: 18, height: 5, borderRadius: 999 };
                }
                if (id === "e" || id === "w") {
                  return { ...handleFill, width: 5, height: 18, borderRadius: 999 };
                }
                return { ...handleFill, width: 12, height: 12, borderRadius: 3 };
              };
              const renderHandle = (id: HandleId) => (
                <div
                  key={id}
                  style={{
                    position: "absolute",
                    ...POS[id],
                    width: 22,
                    height: 22,
                    marginLeft: -11,
                    marginTop: -11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: CURSOR[id],
                    pointerEvents: "auto",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => startTransform(e, single, "resize", id)}
                >
                  <div style={handleVisual(id)} />
                </div>
              );
              return (
                <div style={{ ...boxToStyle(chromeBox), pointerEvents: "none" }}>
                  <div
                    className="absolute inset-0"
                    style={{
                      border: "1.5px solid var(--accent)",
                      borderRadius: 3,
                      boxSizing: "border-box",
                    }}
                  />
                  {showRotate && (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: -28,
                        width: 26,
                        height: 26,
                        marginLeft: -13,
                        marginTop: -13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "grab",
                        pointerEvents: "auto",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => startTransform(e, single, "rotate")}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          background: "var(--accent)",
                          border: "2px solid #fff",
                          borderRadius: "50%",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                        }}
                      />
                    </div>
                  )}
                  {showHandles && corners.map(renderHandle)}
                  {/* Edge handles: image = crop-from-edge, plain text = L/R wrap pills, others = stretch. */}
                  {showHandles && (isPlainText ? textSides : nonTextEdges).map(renderHandle)}
                  {showHandles && isImageSel && (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "100%",
                        transform: "translate(-50%, 14px)",
                        whiteSpace: "nowrap",
                        fontSize: 10,
                        color: "#fff",
                        background: "rgba(0,0,0,0.55)",
                        padding: "1px 6px",
                        borderRadius: 4,
                        pointerEvents: "none",
                      }}
                    >
                      drag edge to crop
                    </div>
                  )}
                </div>
              );
            })()}

          {/* background-removal in-progress shimmer */}
          {bgProcessingUids.map((uid) => {
            const box = canvasBoxOf(design, uid);
            if (!box) return null;
            return (
              <div
                key={`bg-${uid}`}
                style={{ ...boxToStyle(box), pointerEvents: "none" }}
                className="yz-bg-shimmer"
              >
                <div className="absolute inset-0 rounded-[2px] ring-1 ring-[var(--accent)]/70" />
              </div>
            );
          })}

          {/* marquee rectangle */}
          {marquee &&
            (Math.abs(marquee.x1 - marquee.x0) > 2 ||
              Math.abs(marquee.y1 - marquee.y0) > 2) && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(marquee.x0, marquee.x1) * zoom,
                  top: Math.min(marquee.y0, marquee.y1) * zoom,
                  width: Math.abs(marquee.x1 - marquee.x0) * zoom,
                  height: Math.abs(marquee.y1 - marquee.y0) * zoom,
                  background: "rgba(99,102,241,0.10)",
                  border: "1px solid #6366f1",
                  pointerEvents: "none",
                }}
              />
            )}

          {/* smart snap guide lines (Canva-style, full-canvas 1px accent) */}
          {guides.v.map((x, i) => (
            <div
              key={`gv-${i}`}
              style={{
                position: "absolute",
                left: x * zoom,
                top: 0,
                width: 1,
                height: h,
                background: "var(--accent)",
                pointerEvents: "none",
              }}
            />
          ))}
          {guides.h.map((y, i) => (
            <div
              key={`gh-${i}`}
              style={{
                position: "absolute",
                left: 0,
                top: y * zoom,
                width: w,
                height: 1,
                background: "var(--accent)",
                pointerEvents: "none",
              }}
            />
          ))}

          {/* rotation degree readout (house-style dark pill, near the cursor) */}
          {rotHud && (
            <div
              data-testid="rotate-hud"
              style={{
                position: "absolute",
                left: rotHud.left,
                top: rotHud.top,
                transform: "translateY(-100%)",
                pointerEvents: "none",
                fontSize: 11,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: "#fff",
                background: rotHud.strong ? "var(--accent)" : "rgba(20,20,23,0.92)",
                border: rotHud.strong
                  ? "1px solid #fff"
                  : "1px solid rgba(255,255,255,0.14)",
                borderRadius: 6,
                padding: "3px 7px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
                whiteSpace: "nowrap",
                zIndex: 30,
              }}
            >
              {rotHud.deg}°
            </div>
          )}

          {/* live edge-crop preview (darken the cropped-away region) */}
          {liveCrop &&
            dragRef.current?.mode === "cropEdge" &&
            (() => {
              const im = dragRef.current!.imageItem!;
              const mem = im as ImageCropMemory;
              const full = dragRef.current!.fullNatural;
              const hasFull = !!(mem._fullSource && mem._cropRect && full);
              const imgRect = hasFull
                ? fullSourceCanvasBounds(im, mem._cropRect!, full!.w, full!.h)
                : currentCropCanvasRect(im);
              return (
                <>
                  <img
                    src={hasFull ? mem._fullSource : im.source}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: imgRect.x * zoom,
                      top: imgRect.y * zoom,
                      width: imgRect.w * zoom,
                      height: imgRect.h * zoom,
                      objectFit: "fill",
                      opacity: 0.35,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: liveCrop.x * zoom,
                      top: liveCrop.y * zoom,
                      width: liveCrop.w * zoom,
                      height: liveCrop.h * zoom,
                      outline: "1.5px solid var(--accent)",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                      pointerEvents: "none",
                    }}
                  />
                </>
              );
            })()}

          {/* crop mode */}
          {croppingUid !== null &&
            (() => {
              const loc = locate(design, croppingUid);
              if (!loc || loc.item.type !== "image") return null;
              return (
                <CropOverlay
                  item={loc.item as unknown as ImageItem}
                  zoom={zoom}
                  toCanvas={toCanvas}
                  onCancel={cancelCrop}
                  onCommit={(src, geom, memory) => commitCrop(croppingUid, src, geom, memory)}
                />
              );
            })()}

          {/* magic mode (paint / grab) */}
          {magicMode !== null && magicUid !== null &&
            (() => {
              const loc = locate(design, magicUid);
              if (!loc || loc.item.type !== "image") return null;
              const img = loc.item as unknown as ImageItem;
              if (magicMode === "erase" || magicMode === "edit")
                return (
                  <MagicEraseOverlay
                    mode={magicMode}
                    item={img}
                    zoom={zoom}
                    busy={magicBusy}
                    toCanvas={toCanvas}
                    onCancel={cancelMagic}
                    onApply={(mask, prompt) =>
                      magicMode === "edit"
                        ? applyMagicEdit(magicUid, mask, prompt || "")
                        : applyMagicErase(magicUid, mask)
                    }
                  />
                );
              return (
                <MagicGrabOverlay
                  item={img}
                  zoom={zoom}
                  busy={magicBusy}
                  toCanvas={toCanvas}
                  onCancel={cancelMagic}
                  onPick={(x, y) => applyMagicGrab(magicUid, x, y)}
                />
              );
            })()}

          {/* live background-blur preview (non-destructive overlay on the item) */}
          {blurPreview &&
            (() => {
              const loc = locate(design, blurPreview.uid);
              if (!loc || loc.item.type !== "image") return null;
              const im = loc.item as unknown as ImageItem;
              const bl = (im.xpos - im.width / 2) * zoom;
              const bt = (im.ypos - im.height / 2) * zoom;
              return (
                <img
                  data-testid="blur-preview"
                  src={blurPreview.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: bl,
                    top: bt,
                    width: im.width * zoom,
                    height: im.height * zoom,
                    objectFit: "fill",
                    pointerEvents: "none",
                    outline: "1.5px solid var(--accent)",
                    transform: im.rotation ? `rotate(${im.rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                />
              );
            })()}

          {/* inline text editing */}
          {single !== null && editingUid === single && isText && singleItem && (
            <InlineTextEditor
              item={singleItem as any}
              zoom={zoom}
              registerCommit={(commit) => {
                inlineCommitRef.current = commit;
              }}
              onCommit={(text) => {
                setContentByUid(single, text);
                setEditing(null);
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          )}
        </div>
      </div>
      </div>
      <PageStrip />
    </div>
  );
}

/**
 * Bake a canvas-space crop rect into a new image data-URI + geometry, then hand
 * it to `onCommit` (shared by crop-mode and Canva edge-crop). Cross-origin taint
 * is swallowed silently (nothing committed).
 */
function bakeImageCrop(
  item: ImageItem,
  rect: CropRect,
  onCommit: (
    src: string,
    geom: { xpos: number; ypos: number; width: number; height: number },
    memory: Required<Pick<ImageCropMemory, "_fullSource" | "_cropRect">>
  ) => void
) {
  const mem = item as ImageCropMemory;
  const source = mem._fullSource && mem._cropRect ? mem._fullSource : item.source;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const nW = img.naturalWidth || item.width;
    const nH = img.naturalHeight || item.height;
    const hasMemory = !!(mem._fullSource && mem._cropRect);
    const fullRect = hasMemory
      ? canvasRectToFullSourceRect(item, mem._cropRect!, rect, nW, nH)
      : (() => {
          const r0 = computeCrop(item, rect, nW, nH);
          return { x: r0.sx, y: r0.sy, width: r0.sw, height: r0.sh };
        })();
    const geom = hasMemory
      ? fullSourceRectToCanvasGeom(item, mem._cropRect!, fullRect)
      : { xpos: rect.x + rect.w / 2, ypos: rect.y + rect.h / 2, width: rect.w, height: rect.h };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(fullRect.width));
    canvas.height = Math.max(1, Math.round(fullRect.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, fullRect.x, fullRect.y, fullRect.width, fullRect.height, 0, 0, canvas.width, canvas.height);
    let dataUri: string;
    try {
      dataUri = canvas.toDataURL("image/png");
    } catch {
      return; // tainted canvas
    }
    onCommit(dataUri, geom, {
      _fullSource: hasMemory ? mem._fullSource! : item.source,
      _cropRect: fullRect,
    });
  };
  img.src = source;
}

type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

function CropOverlay({
  item,
  zoom,
  toCanvas,
  onCancel,
  onCommit,
}: {
  item: ImageItem;
  zoom: number;
  toCanvas: (cx: number, cy: number) => { x: number; y: number };
  onCancel: () => void;
  onCommit: (
    src: string,
    geom: { xpos: number; ypos: number; width: number; height: number },
    memory: Required<Pick<ImageCropMemory, "_fullSource" | "_cropRect">>
  ) => void;
}) {
  const boxLeft = item.xpos - item.width / 2;
  const boxTop = item.ypos - item.height / 2;
  const mem = item as ImageCropMemory;
  const [fullNatural, setFullNatural] = useState<{ w: number; h: number } | null>(null);
  const fullBounds =
    mem._fullSource && mem._cropRect && fullNatural
      ? fullSourceCanvasBounds(item, mem._cropRect, fullNatural.w, fullNatural.h)
      : { x: boxLeft, y: boxTop, w: item.width, h: item.height };
  const clampRect = (r: CropRect): CropRect => {
    const w = Math.max(8, Math.min(r.w, fullBounds.w));
    const h = Math.max(8, Math.min(r.h, fullBounds.h));
    const x = Math.max(fullBounds.x, Math.min(r.x, fullBounds.x + fullBounds.w - w));
    const y = Math.max(fullBounds.y, Math.min(r.y, fullBounds.y + fullBounds.h - h));
    return { x, y, w, h };
  };

  // Start at the exact image edges (whole image selected) — the user shrinks
  // from there by dragging an edge/corner.
  const [crop, setCrop] = useState<CropRect>(() => ({
    x: boxLeft,
    y: boxTop,
    w: item.width,
    h: item.height,
  }));
  const dragRef = useRef<{ handle: CropHandle; start: CropRect; startCanvas: { x: number; y: number } } | null>(
    null
  );
  const cropRef = useRef(crop);
  cropRef.current = crop;

  const bake = () => {
    bakeImageCrop(item, cropRef.current, onCommit);
  };

  useEffect(() => {
    const src = mem._fullSource || item.source;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setFullNatural({ w: img.naturalWidth || item.width, h: img.naturalHeight || item.height });
    img.src = src;
  }, [item, mem._fullSource]);

  useEffect(() => {
    setCrop((r) => clampRect(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullNatural]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toCanvas(e.clientX, e.clientY);
      const dx = p.x - d.startCanvas.x;
      const dy = p.y - d.startCanvas.y;
      const s = d.start;
      let r: CropRect;
      if (d.handle === "move") {
        r = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
      } else {
        let x = s.x;
        let y = s.y;
        let w = s.w;
        let h = s.h;
        if (d.handle.includes("w")) { x = s.x + dx; w = s.w - dx; }
        if (d.handle.includes("e")) { w = s.w + dx; }
        if (d.handle.includes("n")) { y = s.y + dy; h = s.h - dy; }
        if (d.handle.includes("s")) { h = s.h + dy; }
        r = { x, y, w, h };
      }
      setCrop(clampRect(r));
    };
    const onUp = () => { dragRef.current = null; };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); bake(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullBounds.x, fullBounds.y, fullBounds.w, fullBounds.h]);

  const px = (v: number) => v * zoom;
  const rectStyle: CSSProperties = {
    position: "absolute",
    left: px(crop.x),
    top: px(crop.y),
    width: px(crop.w),
    height: px(crop.h),
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
    outline: "1.5px solid #6366f1",
    cursor: "move",
  };
  const handleBase: CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    background: "#fff",
    border: "1.5px solid #6366f1",
    borderRadius: 2,
  };
  const handlePos: Record<Exclude<CropHandle, "move">, CSSProperties> = {
    nw: { left: 0, top: 0, cursor: "nwse-resize" },
    n: { left: "50%", top: 0, cursor: "ns-resize" },
    ne: { left: "100%", top: 0, cursor: "nesw-resize" },
    e: { left: "100%", top: "50%", cursor: "ew-resize" },
    se: { left: "100%", top: "100%", cursor: "nwse-resize" },
    s: { left: "50%", top: "100%", cursor: "ns-resize" },
    sw: { left: 0, top: "100%", cursor: "nesw-resize" },
    w: { left: 0, top: "50%", cursor: "ew-resize" },
  };

  const startDrag = (e: RPointerEvent, handle: CropHandle) => {
    e.stopPropagation();
    dragRef.current = { handle, start: crop, startCanvas: toCanvas(e.clientX, e.clientY) };
  };

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
      {/* full (uncropped) image beneath the mask */}
      <img
        src={mem._fullSource || item.source}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: px(fullBounds.x),
          top: px(fullBounds.y),
          width: px(fullBounds.w),
          height: px(fullBounds.h),
          objectFit: "fill",
          opacity: mem._fullSource ? 0.55 : 1,
          pointerEvents: "none",
        }}
      />
      <div style={rectStyle} onPointerDown={(e) => startDrag(e, "move")}>
        {(Object.keys(handlePos) as Exclude<CropHandle, "move">[]).map((hk) => (
          <div
            key={hk}
            style={{ ...handleBase, ...handlePos[hk] }}
            onPointerDown={(e) => startDrag(e, hk)}
          />
        ))}
      </div>
      {/* toolbar */}
      <div
        style={{
          position: "absolute",
          left: px(crop.x),
          top: px(crop.y + crop.h) + 8,
          display: "flex",
          gap: 6,
        }}
      >
        <button
          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={bake}
        >
          Apply crop ⏎
        </button>
        <button
          className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-600"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancel}
        >
          Cancel ⎋
        </button>
      </div>
    </div>
  );
}

/**
 * Magic Eraser mask-paint overlay. The user brushes over the object; strokes are
 * kept in canvas units and rasterised to a mask at the source's native
 * resolution on apply. The translucent accent smear previews the mask.
 */
function MagicEraseOverlay({
  mode = "erase",
  item,
  zoom,
  busy,
  toCanvas,
  onCancel,
  onApply,
}: {
  mode?: "erase" | "edit";
  item: ImageItem;
  zoom: number;
  busy: boolean;
  toCanvas: (cx: number, cy: number) => { x: number; y: number };
  onCancel: () => void;
  onApply: (maskDataUri: string, prompt?: string) => void;
}) {
  const boxLeft = item.xpos - item.width / 2;
  const boxTop = item.ypos - item.height / 2;
  const px = (v: number) => v * zoom;

  const [brushPx, setBrushPx] = useState(28);
  const [prompt, setPrompt] = useState("");
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, tick] = useState(0);
  const brushCanvasR = brushPx / zoom; // radius in canvas units

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(99,102,241,0.5)";
    ctx.fillStyle = "rgba(99,102,241,0.5)";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of strokesRef.current) {
      if (s.points.length === 0) continue;
      ctx.lineWidth = s.radius * 2 * zoom;
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0].x * zoom, s.points[0].y * zoom, s.radius * zoom, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * zoom, s.points[0].y * zoom);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * zoom, s.points[i].y * zoom);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const onUp = () => { drawingRef.current = false; };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Enter") { e.preventDefault(); apply(); }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPoint = (clientX: number, clientY: number) => {
    const p = toCanvas(clientX, clientY);
    const local = { x: p.x - boxLeft, y: p.y - boxTop };
    const cur = strokesRef.current[strokesRef.current.length - 1];
    if (cur) cur.points.push(local);
    redraw();
    tick((n) => n + 1);
  };

  const apply = async () => {
    if (busy || !hasStrokes(strokesRef.current)) return;
    if (mode === "edit" && !prompt.trim()) return;
    try {
      const img = await loadImage(item.source);
      const nW = img.naturalWidth || item.width;
      const nH = img.naturalHeight || item.height;
      const scale = nW / item.width;
      const scaled: Stroke[] = strokesRef.current.map((s) => ({
        radius: s.radius * scale,
        points: s.points.map((pt) => ({ x: pt.x * scale, y: pt.y * scale })),
      }));
      const mask = strokesToMaskDataUri(scaled, Math.round(nW), Math.round(nH));
      onApply(mask, prompt);
    } catch {
      onCancel();
    }
  };

  const dispW = px(item.width);
  const dispH = px(item.height);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
      {/* dim outside the image */}
      <div
        data-testid="magic-paint"
        style={{
          position: "absolute",
          left: px(boxLeft),
          top: px(boxTop),
          width: dispW,
          height: dispH,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          outline: "1.5px solid #6366f1",
          cursor: "crosshair",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          if (busy) return;
          e.stopPropagation();
          drawingRef.current = true;
          strokesRef.current.push({ radius: brushCanvasR, points: [] });
          addPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || busy) return;
          addPoint(e.clientX, e.clientY);
        }}
      >
        <canvas
          ref={canvasRef}
          width={Math.max(1, Math.round(dispW))}
          height={Math.max(1, Math.round(dispH))}
          style={{ position: "absolute", inset: 0, width: dispW, height: dispH, pointerEvents: "none" }}
        />
      </div>
      {/* toolbar — never narrower than 380px so the Edit prompt stays usable
          on small images; centered under the item when wider than it. */}
      <div
        style={{
          position: "absolute",
          left: px(boxLeft + item.width / 2),
          top: px(boxTop + item.height) + 8,
          width: Math.max(dispW, 380),
          transform: "translateX(-50%)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 rounded-lg bg-neutral-900/95 px-3 py-2 shadow-lg ring-1 ring-white/10">
          <span className="text-[11px] text-neutral-400">Brush</span>
          <input
            type="range"
            min={8}
            max={90}
            value={brushPx}
            onChange={(e) => { setBrushPx(Number(e.target.value)); tick((n) => n + 1); }}
            className="yz-range w-24"
            disabled={busy}
          />
          {mode === "edit" && (
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Replace with…"
              className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-[var(--accent)]"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void apply();
                }
              }}
            />
          )}
          <button
            className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
            onClick={apply}
            disabled={busy || !hasStrokes(strokesRef.current) || (mode === "edit" && !prompt.trim())}
          >
            {busy ? (mode === "edit" ? "Editing…" : "Erasing…") : mode === "edit" ? "Apply ⏎" : "Erase ⏎"}
          </button>
          <button
            className="rounded bg-white/10 px-3 py-1 text-xs text-neutral-100 hover:bg-white/20"
            onClick={onCancel}
          >
            Cancel ⎋
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Magic Grab picker: click a subject in the image to segment + lift it. The
 * click point is mapped to the source image's native pixel space.
 */
function MagicGrabOverlay({
  item,
  zoom,
  busy,
  toCanvas,
  onCancel,
  onPick,
}: {
  item: ImageItem;
  zoom: number;
  busy: boolean;
  toCanvas: (cx: number, cy: number) => { x: number; y: number };
  onCancel: () => void;
  onPick: (imgX: number, imgY: number) => void;
}) {
  const boxLeft = item.xpos - item.width / 2;
  const boxTop = item.ypos - item.height / 2;
  const px = (v: number) => v * zoom;
  const natRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(item.source)
      .then((img) => { if (alive) natRef.current = { w: img.naturalWidth || item.width, h: img.naturalHeight || item.height }; })
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { alive = false; window.removeEventListener("keydown", onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        data-testid="magic-grab"
        style={{
          position: "absolute",
          left: px(boxLeft),
          top: px(boxTop),
          width: px(item.width),
          height: px(item.height),
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          outline: "1.5px solid #6366f1",
          cursor: busy ? "progress" : "crosshair",
        }}
        onPointerDown={(e) => {
          if (busy) return;
          e.stopPropagation();
          const nat = natRef.current;
          if (!nat) return;
          const p = toCanvas(e.clientX, e.clientY);
          const fx = (p.x - boxLeft) / item.width;
          const fy = (p.y - boxTop) / item.height;
          onPick(fx * nat.w, fy * nat.h);
        }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-neutral-900/85 px-3 py-1.5 text-[11px] font-medium text-neutral-100 ring-1 ring-white/10">
            {busy ? (
              <span className="inline-flex items-center gap-1.5"><Icon name="sparkles" size={13} /> Lifting subject…</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><Icon name="sparkles" size={13} /> Click the subject to grab it · Esc to cancel</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function InlineTextEditor({
  item,
  zoom,
  registerCommit,
  onCommit,
  onCancel,
}: {
  item: any;
  zoom: number;
  registerCommit: (commit: () => void) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const box = inlineTextEditBox(item);
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const latestTextRef = useRef(item.content);
  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(latestTextRef.current);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = item.content;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    registerCommit(commit);
    return () => registerCommit(() => {});
  });

  const style: CSSProperties = {
    position: "absolute",
    left: (box.cx - box.w / 2) * zoom,
    top: (box.cy - box.h / 2) * zoom,
    width: box.w * zoom,
    height: box.h * zoom,
    transform: `rotate(${box.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: "auto",
    fontFamily: `"${item.font}", sans-serif`,
    fontSize: item.size * zoom,
    lineHeight: item.wrapping ? `${item.size * 1.2 * zoom}px` : `${box.h * zoom}px`,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textAlign: item.alignment,
    color: "#111",
    background: "rgba(255,255,255,0.92)",
    outline: "2px solid #6366f1",
    whiteSpace: item.wrapping ? "pre-wrap" : "pre",
    overflow: "hidden",
    boxSizing: "border-box",
  };

  return (
    <div
      data-inline-text-editor="true"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => {
        latestTextRef.current = e.currentTarget.textContent ?? "";
      }}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
}

function inlineTextEditBox(item: any): SelBox {
  if (item.type !== "text") return itemBox(item);
  const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
  const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;
  const left = item.xpos + item.textAreaxpos * sx;
  const top = item.ypos + item.textAreaypos * sy;
  const w = item.mcWidth || item.textAreaWidth * sx;
  const h = item.mcHeight || item.textAreaHeight * sy;
  return { cx: left + w / 2, cy: top + h / 2, w, h, rotation: item.rotation };
}
