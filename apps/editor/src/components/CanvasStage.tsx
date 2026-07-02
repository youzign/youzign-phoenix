import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as RPointerEvent } from "react";
import { DesignCanvas } from "@youzign/renderer";
import { itemBox, type SelBox } from "@youzign/editor-core";
import type { Item } from "@youzign/designstring";
import { useEditor } from "../store.js";

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
}

export function CanvasStage() {
  const design = useEditor((s) => s.design);
  const zoom = useEditor((s) => s.zoom);
  const selectedUid = useEditor((s) => s.selectedUid);
  const editingUid = useEditor((s) => s.editingUid);
  const select = useEditor((s) => s.select);
  const setEditing = useEditor((s) => s.setEditing);
  const beginHistory = useEditor((s) => s.beginHistory);
  const livePatch = useEditor((s) => s.livePatchByUid);
  const endGesture = useEditor((s) => s.endGesture);
  const setContentByUid = useEditor((s) => s.setContentByUid);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [, force] = useState(0);

  const w = design.canvasWidth * zoom;
  const h = design.canvasHeight * zoom;

  const toCanvas = (clientX: number, clientY: number) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toCanvas(e.clientX, e.clientY);
      const b = d.startBox;
      const shift = e.shiftKey;

      if (d.mode === "move") {
        const dx = p.x - d.startCanvas.x;
        const dy = p.y - d.startCanvas.y;
        livePatch(d.uid, { xpos: b.cx + dx, ypos: b.cy + dy });
      } else if (d.mode === "rotate") {
        const ang = (Math.atan2(p.y - b.cy, p.x - b.cx) * 180) / Math.PI + 90;
        const snapped = shift ? Math.round(ang / 15) * 15 : ang;
        livePatch(d.uid, { rotation: snapped });
      } else if (d.mode === "resize" && d.corner) {
        const [sx, sy] = CORNER_SIGN[d.corner];
        // Fixed (opposite) corner in canvas space.
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
        // Recompute center so the fixed corner truly stays put.
        const newOppOff = rot((-sx * nw) / 2, (-sy * nh) / 2, b.rotation);
        const cx = fixed.x - newOppOff.x;
        const cy = fixed.y - newOppOff.y;
        livePatch(d.uid, { width: nw, height: nh, xpos: cx, ypos: cy });
      }
    };
    const onUp = () => {
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
  }, [zoom]);

  const startDrag = (
    e: RPointerEvent,
    uid: number,
    mode: Drag["mode"],
    corner?: Corner
  ) => {
    e.stopPropagation();
    const item = design.items.find((i) => (i as IdItem)._uid === uid) as IdItem | undefined;
    if (!item) return;
    beginHistory();
    dragRef.current = {
      mode,
      corner,
      startBox: itemBox(item as any),
      startCanvas: toCanvas(e.clientX, e.clientY),
      uid,
    };
  };

  const items = design.items as IdItem[];
  const selected = items.find((i) => i._uid === selectedUid);
  const isText = selected && (selected.type === "text" || selected.type === "text-curved");

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-[#1b1b1f] p-10">
      <div
        className="relative shadow-2xl ring-1 ring-black/40"
        style={{ width: w, height: h }}
      >
        <DesignCanvas design={design} zoom={zoom} />

        {/* interaction overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ width: w, height: h }}
          onPointerDown={() => select(null)}
        >
          {/* per-item hit areas (topmost index wins via DOM order) */}
          {[...items]
            .sort((a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0))
            .map((item) => {
              const box = itemBox(item as any);
              const uid = item._uid!;
              const boxStyle: CSSProperties = {
                position: "absolute",
                left: (box.cx - box.w / 2) * zoom,
                top: (box.cy - box.h / 2) * zoom,
                width: box.w * zoom,
                height: box.h * zoom,
                transform: `rotate(${box.rotation}deg)`,
                transformOrigin: "center center",
                cursor: "move",
              };
              return (
                <div
                  key={uid}
                  style={boxStyle}
                  onPointerDown={(e) => {
                    select(uid);
                    startDrag(e, uid, "move");
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (item.type === "text" || item.type === "text-curved") {
                      select(uid);
                      setEditing(uid);
                    }
                  }}
                />
              );
            })}

          {/* selection chrome */}
          {selected &&
            editingUid !== selectedUid &&
            (() => {
              const box = itemBox(selected as any);
              const chrome: CSSProperties = {
                position: "absolute",
                left: (box.cx - box.w / 2) * zoom,
                top: (box.cy - box.h / 2) * zoom,
                width: box.w * zoom,
                height: box.h * zoom,
                transform: `rotate(${box.rotation}deg)`,
                transformOrigin: "center center",
                pointerEvents: "none",
              };
              const handle: CSSProperties = {
                position: "absolute",
                width: 11,
                height: 11,
                marginLeft: -6,
                marginTop: -6,
                background: "#fff",
                border: "1.5px solid #4f8cff",
                borderRadius: 2,
                pointerEvents: "auto",
              };
              const corners: Record<Corner, CSSProperties> = {
                nw: { left: 0, top: 0, cursor: "nwse-resize" },
                ne: { left: "100%", top: 0, cursor: "nesw-resize" },
                se: { left: "100%", top: "100%", cursor: "nwse-resize" },
                sw: { left: 0, top: "100%", cursor: "nesw-resize" },
              };
              return (
                <div style={chrome}>
                  <div
                    className="absolute inset-0"
                    style={{ outline: "1.5px solid #4f8cff", outlineOffset: 0 }}
                  />
                  {/* rotation handle */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: -26,
                      width: 13,
                      height: 13,
                      marginLeft: -7,
                      background: "#4f8cff",
                      border: "2px solid #fff",
                      borderRadius: "50%",
                      cursor: "grab",
                      pointerEvents: "auto",
                    }}
                    onPointerDown={(e) => startDrag(e, selectedUid!, "rotate")}
                  />
                  {!isText &&
                    (Object.keys(corners) as Corner[]).map((c) => (
                      <div
                        key={c}
                        style={{ ...handle, ...corners[c] }}
                        onPointerDown={(e) => startDrag(e, selectedUid!, "resize", c)}
                      />
                    ))}
                </div>
              );
            })()}

          {/* inline text editing */}
          {selected && editingUid === selectedUid && isText && (
            <InlineTextEditor
              item={selected as any}
              zoom={zoom}
              onCommit={(text) => {
                setContentByUid(selectedUid!, text);
                setEditing(null);
              }}
            />
          )}
        </div>
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
    outline: "2px solid #4f8cff",
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
