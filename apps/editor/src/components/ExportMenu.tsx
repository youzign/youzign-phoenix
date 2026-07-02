import { useEffect, useRef, useState } from "react";
import { Icon, Switch, segItem } from "./ui.js";
import { runExport } from "../export/runExport.js";
import {
  EXPORT_SCALES,
  JPG_QUALITY,
  scaledDimensions,
  type ExportFormat,
  type ExportScale,
} from "../export/exportMath.js";

const LS_KEY = "youzign-next:export-prefs";
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
  { id: "pdf", label: "PDF" },
];

interface Prefs {
  format: ExportFormat;
  scale: ExportScale;
  transparent: boolean;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        format: p.format ?? "png",
        scale: (p.scale as ExportScale) ?? 1,
        transparent: !!p.transparent,
      };
    }
  } catch {
    /* ignore */
  }
  return { format: "png", scale: 1, transparent: false };
}

export function ExportMenu({
  designName,
  canvasWidth,
  canvasHeight,
}: {
  designName: string;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

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

  const scalable = prefs.format !== "pdf";
  const dims = scaledDimensions(canvasWidth, canvasHeight, scalable ? prefs.scale : 1);

  const doExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runExport({
        format: prefs.format,
        scale: scalable ? prefs.scale : 1,
        transparent: prefs.transparent,
        designName,
        canvasWidth,
        canvasHeight,
      });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-stretch">
      {/* split button: primary export + chevron toggle */}
      <button
        className="inline-flex items-center gap-1.5 rounded-l-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors duration-150 hover:brightness-110 disabled:opacity-60"
        onClick={doExport}
        disabled={busy}
        data-testid="export-run"
      >
        <Icon name="download" size={16} />
        {busy ? "Exporting…" : `Export ${prefs.format.toUpperCase()}`}
      </button>
      <button
        className="inline-flex items-center rounded-r-md bg-[var(--accent)] px-1.5 py-1.5 text-white shadow-sm transition-colors duration-150 hover:brightness-110 border-l border-black/15"
        onClick={() => setOpen((o) => !o)}
        aria-label="Export options"
        data-testid="export-toggle"
      >
        <Icon name="chevron-down" size={15} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[248px] rounded-xl border border-white/10 bg-[#202024] p-3 shadow-2xl"
          data-testid="export-popover"
        >
          {/* format */}
          <div className="text-[11px] font-medium text-neutral-400">Format</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-0.5">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={segItem(prefs.format === f.id)}
                onClick={() => setPrefs((p) => ({ ...p, format: f.id }))}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* scale (png/jpg) */}
          {scalable && (
            <div className="mt-3">
              <div className="text-[11px] font-medium text-neutral-400">Scale</div>
              <div className="mt-1.5 grid grid-cols-5 gap-1 rounded-lg bg-white/[0.05] p-0.5">
                {EXPORT_SCALES.map((s) => (
                  <button
                    key={s}
                    className={segItem(prefs.scale === s)}
                    onClick={() => setPrefs((p) => ({ ...p, scale: s }))}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* transparent (png only) */}
          {prefs.format === "png" && (
            <label className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-neutral-200">Transparent background</span>
              <Switch
                on={prefs.transparent}
                onChange={() => setPrefs((p) => ({ ...p, transparent: !p.transparent }))}
              />
            </label>
          )}

          {/* per-format note */}
          <p className="mt-3 text-[11px] leading-snug text-neutral-500">
            {prefs.format === "jpg" && `JPEG quality ${JPG_QUALITY} · flattened, no transparency.`}
            {prefs.format === "pdf" &&
              `Single ${canvasWidth > canvasHeight ? "landscape" : "portrait"} page, full-bleed.`}
            {prefs.format === "png" &&
              `Lossless${prefs.transparent ? " · no background layer" : ""}.`}
          </p>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] tabular-nums text-neutral-500">
              {prefs.format === "pdf"
                ? `${canvasWidth}×${canvasHeight}px`
                : `${dims.width}×${dims.height}px`}
            </span>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors duration-150 hover:brightness-110 disabled:opacity-60"
              onClick={doExport}
              disabled={busy}
            >
              <Icon name="download" size={15} />
              {busy ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
