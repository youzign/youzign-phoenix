import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as RDragEvent, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from "react";
import { DesignCanvas } from "@youzign/renderer";
import {
  itemBox,
  childBoxInCanvas,
  combinedBox,
  boxIntersectsRect,
  computeCrop,
  type SelBox,
  type CropRect,
} from "@youzign/editor-core";
import type { Design, ImageItem, Item } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { ingestFiles } from "../library/uploads.js";

type IdItem = Item & { _uid?: number };

function rot(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

type Corner = "nw" | "ne" | "se" | "sw";
const CORNER_SIGN: Record<Corner, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

interface Drag {
  mode: "move" | "resize" | "rotate";
  corner?: Corner;
  startBox: SelBox;
  startCanvas: { x: number; y: number };
  uid: number;
  // for multi-move: starting positions of every moved item
  moveStarts?: { uid: number; xpos: number; ypos: number }[];
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

export function CanvasStage() {
  const design = useEditor((s) => s.design);
  const zoom = useEditor((s) => s.zoom);
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
  const bgProcessingUids = useEditor((s) => s.bgProcessingUids);
  const beginCrop = useEditor((s) => s.beginCrop);
  const cancelCrop = useEditor((s) => s.cancelCrop);
  const commitCrop = useEditor((s) => s.commitCrop);
  const addPhoto = useEditor((s) => s.addPhoto);
  const lockedUids = useEditor((s) => s.lockedUids);
  const isLocked = (uid: number) => lockedUids.includes(uid);

  const [fileOver, setFileOver] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
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
        const dx = p.x - d.startCanvas.x;
        const dy = p.y - d.startCanvas.y;
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
        const snapped = shift ? Math.round(ang / 15) * 15 : ang;
        livePatch(d.uid, { rotation: snapped });
      } else if (d.mode === "resize" && d.corner) {
        const [sx, sy] = CORNER_SIGN[d.corner];
        const oppLocal = { x: (-sx * b.w) / 2, y: (-sy * b.h) / 2 };
        const oppWorldOff = rot(oppLocal.x, oppLocal.y, b.rotation);
        const fixed = { x: b.cx + oppWorldOff.x, y: b.cy + oppWorldOff.y };
        const newCenter = { x: (p.x + fixed.x) / 2, y: (p.y + fixed.y) / 2 };
        const local = rot(p.x - newCenter.x, p.y - newCenter.y, -b.rotation);
        let nw = Math.max(8, Math.abs(local.x) * 2);
        let nh = Math.max(8, Math.abs(local.y) * 2);
        if (shift) {
          const ratio = b.w / b.h || 1;
          if (nw / nh > ratio) nh = nw / ratio;
          else nw = nh * ratio;
        }
        const newOppOff = rot((-sx * nw) / 2, (-sy * nh) / 2, b.rotation);
        const cx = fixed.x - newOppOff.x;
        const cy = fixed.y - newOppOff.y;
        livePatch(d.uid, { width: nw, height: nh, xpos: cx, ypos: cy });
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
      if (dragRef.current) {
        dragRef.current = null;
        endGesture();
        force((n) => n + 1);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, marquee, design]);

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
    dragRef.current = {
      mode: "move",
      startBox: { cx: 0, cy: 0, w: 0, h: 0, rotation: 0 },
      startCanvas: toCanvas(e.clientX, e.clientY),
      uid: movable[0],
      moveStarts,
    };
  };

  const startTransform = (
    e: RPointerEvent,
    uid: number,
    mode: "resize" | "rotate",
    corner?: Corner
  ) => {
    e.stopPropagation();
    if (isLocked(uid)) return; // locked items can't be resized/rotated
    const box = canvasBoxOf(design, uid);
    if (!box) return;
    beginHistory();
    dragRef.current = {
      mode,
      corner,
      startBox: box,
      startCanvas: toCanvas(e.clientX, e.clientY),
      uid,
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
    if (item.type === "image") {
      beginCrop(uid);
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
    <div
      className="flex h-full w-full items-center justify-center overflow-auto bg-[#141417] p-10"
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
        <DesignCanvas design={design} zoom={zoom} />

        {/* interaction overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ width: w, height: h }}
          onPointerDown={(e) => {
            if (croppingUid !== null) return; // crop mode owns interaction
            // marquee start on empty canvas
            const p = toCanvas(e.clientX, e.clientY);
            marqueeRef.current = { x0: p.x, y0: p.y };
            setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
        >
          {/* per-item hit areas (topmost index wins via DOM order) */}
          {croppingUid === null && [...items]
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
            single !== null &&
            singleBox &&
            editingUid !== single &&
            (() => {
              const handle: CSSProperties = {
                position: "absolute",
                width: 11,
                height: 11,
                marginLeft: -6,
                marginTop: -6,
                background: "#fff",
                border: "1.5px solid #6366f1",
                borderRadius: 2,
                pointerEvents: "auto",
              };
              const corners: Record<Corner, CSSProperties> = {
                nw: { left: 0, top: 0, cursor: "nwse-resize" },
                ne: { left: "100%", top: 0, cursor: "nesw-resize" },
                se: { left: "100%", top: "100%", cursor: "nwse-resize" },
                sw: { left: 0, top: "100%", cursor: "nesw-resize" },
              };
              // Resize/rotate handles only for a single TOP-LEVEL, non-text,
              // unlocked item.
              const locked = single !== null && isLocked(single);
              const showHandles = selectedIsTopLevel && !isText && !locked;
              const showRotate = selectedIsTopLevel && !locked;
              return (
                <div style={{ ...boxToStyle(singleBox), pointerEvents: "none" }}>
                  <div
                    className="absolute inset-0"
                    style={{ outline: "1.5px solid #6366f1", outlineOffset: 0 }}
                  />
                  {showRotate && (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: -26,
                        width: 13,
                        height: 13,
                        marginLeft: -7,
                        background: "#6366f1",
                        border: "2px solid #fff",
                        borderRadius: "50%",
                        cursor: "grab",
                        pointerEvents: "auto",
                      }}
                      onPointerDown={(e) => startTransform(e, single, "rotate")}
                    />
                  )}
                  {showHandles &&
                    (Object.keys(corners) as Corner[]).map((c) => (
                      <div
                        key={c}
                        style={{ ...handle, ...corners[c] }}
                        onPointerDown={(e) => startTransform(e, single, "resize", c)}
                      />
                    ))}
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
                  onCommit={(src, geom) => commitCrop(croppingUid, src, geom)}
                />
              );
            })()}

          {/* inline text editing */}
          {single !== null && editingUid === single && isText && singleItem && (
            <InlineTextEditor
              item={singleItem as any}
              zoom={zoom}
              onCommit={(text) => {
                setContentByUid(single, text);
                setEditing(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
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
    geom: { xpos: number; ypos: number; width: number; height: number }
  ) => void;
}) {
  const boxLeft = item.xpos - item.width / 2;
  const boxTop = item.ypos - item.height / 2;
  const clampRect = (r: CropRect): CropRect => {
    const w = Math.max(8, Math.min(r.w, item.width));
    const h = Math.max(8, Math.min(r.h, item.height));
    const x = Math.max(boxLeft, Math.min(r.x, boxLeft + item.width - w));
    const y = Math.max(boxTop, Math.min(r.y, boxTop + item.height - h));
    return { x, y, w, h };
  };

  const [crop, setCrop] = useState<CropRect>(() => ({
    x: boxLeft + item.width * 0.12,
    y: boxTop + item.height * 0.12,
    w: item.width * 0.76,
    h: item.height * 0.76,
  }));
  const dragRef = useRef<{ handle: CropHandle; start: CropRect; startCanvas: { x: number; y: number } } | null>(
    null
  );
  const cropRef = useRef(crop);
  cropRef.current = crop;

  const bake = () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const nW = img.naturalWidth || item.width;
      const nH = img.naturalHeight || item.height;
      const r = computeCrop(item, cropRef.current, nW, nH);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(r.sw));
      canvas.height = Math.max(1, Math.round(r.sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) return onCancel();
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
      let dataUri: string;
      try {
        dataUri = canvas.toDataURL("image/png");
      } catch {
        return onCancel(); // tainted canvas (cross-origin) — cannot bake
      }
      onCommit(dataUri, { xpos: r.xpos, ypos: r.ypos, width: r.width, height: r.height });
    };
    img.onerror = () => onCancel();
    img.src = item.source;
  };

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
  }, []);

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
        src={item.source}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: px(boxLeft),
          top: px(boxTop),
          width: px(item.width),
          height: px(item.height),
          objectFit: "fill",
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

function InlineTextEditor({
  item,
  zoom,
  onCommit,
}: {
  item: any;
  zoom: number;
  onCommit: (text: string) => void;
}) {
  const box = itemBox(item);
  const ref = useRef<HTMLDivElement>(null);
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
    lineHeight: `${box.h * zoom}px`,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textAlign: item.alignment,
    color: "#111",
    background: "rgba(255,255,255,0.92)",
    outline: "2px solid #6366f1",
    whiteSpace: "pre",
    overflow: "hidden",
    boxSizing: "border-box",
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(e.currentTarget.textContent ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCommit(item.content);
        }
      }}
    />
  );
}
