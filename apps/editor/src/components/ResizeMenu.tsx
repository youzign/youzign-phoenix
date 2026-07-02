import { useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_PRESETS,
  PRESET_CATEGORIES,
  CANVAS_MIN,
  CANVAS_MAX,
  clampCanvasDim,
  type CanvasPreset,
  type PresetCategory,
} from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { Icon, Switch, ghostBtn, segItem } from "./ui.js";

/** Tiny aspect-ratio thumbnail sized to fit a 26×20 box. */
function RatioThumb({ w, h, active }: { w: number; h: number; active: boolean }) {
  const maxW = 26;
  const maxH = 20;
  const r = w / h;
  let tw = maxW;
  let th = tw / r;
  if (th > maxH) {
    th = maxH;
    tw = th * r;
  }
  return (
    <span className="flex h-5 w-[26px] shrink-0 items-center justify-center">
      <span
        className={`rounded-[2px] ${active ? "bg-[var(--accent)]" : "bg-white/25"}`}
        style={{ width: Math.max(4, tw), height: Math.max(4, th) }}
      />
    </span>
  );
}

export function ResizeMenu() {
  const design = useEditor((s) => s.design);
  const resize = useEditor((s) => s.resize);

  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<PresetCategory>("Social");
  const [query, setQuery] = useState("");
  const [scaleElements, setScaleElements] = useState(true);
  const [customW, setCustomW] = useState(String(design.canvasWidth));
  const [customH, setCustomH] = useState(String(design.canvasHeight));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomW(String(design.canvasWidth));
    setCustomH(String(design.canvasHeight));
  }, [design.canvasWidth, design.canvasHeight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return CANVAS_PRESETS.filter((p) => {
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q) ||
          `${p.width}x${p.height}`.includes(q.replace(/\s|×/g, "x"))
        );
      }
      return p.category === cat;
    });
  }, [q, cat]);

  const applyPreset = (p: CanvasPreset) => {
    resize(p.width, p.height, { scaleElements, dpi: p.dpi });
    setOpen(false);
  };

  const applyCustom = () => {
    const w = clampCanvasDim(Number(customW));
    const h = clampCanvasDim(Number(customH));
    resize(w, h, { scaleElements });
    setOpen(false);
  };

  const current = (p: CanvasPreset) =>
    p.width === design.canvasWidth && p.height === design.canvasHeight;

  return (
    <div ref={rootRef} className="relative">
      <button
        className={ghostBtn}
        onClick={() => setOpen((o) => !o)}
        data-testid="resize-toggle"
        aria-label="Resize canvas"
      >
        <Icon name="crop" size={16} />
        Resize
        <span className="ml-0.5 text-[11px] tabular-nums text-neutral-500">
          {design.canvasWidth}×{design.canvasHeight}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-xl border border-white/10 bg-[#202024] p-3 shadow-2xl"
          data-testid="resize-popover"
        >
          {/* search */}
          <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1.5">
            <Icon name="search" size={15} className="text-neutral-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sizes…"
              spellCheck={false}
              className="w-full bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>

          {/* category tabs (hidden while searching) */}
          {!q && (
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-white/[0.05] p-0.5">
              {PRESET_CATEGORIES.map((c) => (
                <button key={c} className={segItem(cat === c)} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* preset list */}
          <div className="mt-2 max-h-[280px] overflow-y-auto pr-0.5" data-testid="resize-list">
            {visible.length === 0 && (
              <p className="px-1 py-6 text-center text-[12px] text-neutral-500">
                No sizes match “{query}”.
              </p>
            )}
            {visible.map((p) => {
              const active = current(p);
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    active ? "bg-white/[0.09]" : "hover:bg-white/[0.06]"
                  }`}
                >
                  <RatioThumb w={p.width} h={p.height} active={active} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-neutral-100">
                      {p.name}
                    </span>
                    {q && (
                      <span className="block text-[10.5px] text-neutral-500">{p.group}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
                    {p.width}×{p.height}
                  </span>
                </button>
              );
            })}
          </div>

          {/* custom size */}
          <div className="mt-2 border-t border-white/[0.06] pt-2.5">
            <div className="text-[11px] font-medium text-neutral-400">Custom size</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <label className="flex flex-1 items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1.5">
                <span className="text-[11px] text-neutral-500">W</span>
                <input
                  type="number"
                  min={CANVAS_MIN}
                  max={CANVAS_MAX}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-right text-[13px] tabular-nums text-neutral-100 outline-none"
                />
              </label>
              <span className="text-neutral-600">×</span>
              <label className="flex flex-1 items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1.5">
                <span className="text-[11px] text-neutral-500">H</span>
                <input
                  type="number"
                  min={CANVAS_MIN}
                  max={CANVAS_MAX}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-right text-[13px] tabular-nums text-neutral-100 outline-none"
                />
              </label>
              <button
                className="inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:brightness-110"
                onClick={applyCustom}
                data-testid="resize-custom-apply"
              >
                Apply
              </button>
            </div>
          </div>

          {/* smart-resize toggle */}
          <label className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2">
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-neutral-200">
                Scale elements to fit
              </span>
              <span className="block text-[11px] leading-tight text-neutral-500">
                Resize the design proportionally, keeping it centred.
              </span>
            </span>
            <Switch on={scaleElements} onChange={() => setScaleElements((v) => !v)} />
          </label>
        </div>
      )}
    </div>
  );
}
