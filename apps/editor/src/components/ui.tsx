import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GOOGLE_FONTS } from "@youzign/editor-core";
import { ensureGoogleFonts } from "../fonts.js";

/* ------------------------------------------------------------------ *
 * Icons — inline lucide-style SVG paths (stroke, no external dep).
 * ------------------------------------------------------------------ */

export type IconName =
  | "undo"
  | "redo"
  | "minus"
  | "plus"
  | "upload"
  | "download"
  | "search"
  | "sparkles"
  | "shapes"
  | "star"
  | "wand"
  | "check"
  | "chevron-down"
  | "image-off"
  | "image"
  | "type"
  | "bring-front"
  | "send-back"
  | "copy"
  | "trash"
  | "crop"
  | "grid"
  | "scissors"
  | "bold"
  | "italic"
  | "underline"
  | "align-left"
  | "align-center"
  | "align-right"
  | "strikethrough"
  | "flip-h"
  | "flip-v"
  | "center-h"
  | "center-v"
  | "lock"
  | "unlock"
  | "layer-forward"
  | "layer-backward"
  | "grip"
  | "layers"
  | "cloud"
  | "droplet";

const PATHS: Record<IconName, ReactNode> = {
  cloud: <path d="M17.5 19H8a5 5 0 1 1 .9-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z" />,
  droplet: <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />,
  undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h1" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 15V3m0 0L8 7m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  sparkles: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />,
  shapes: (
    <>
      <rect x="3" y="12" width="9" height="9" rx="1.5" />
      <circle cx="17" cy="6.5" r="3.5" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
  wand: <path d="M15 4V2m0 20v-2M8.5 8.5 4 4m16 16-4.5-4.5M4 15h2m14-6h2M6.3 6.3l1.4 1.4M3 21l9-9" />,
  check: <path d="m20 6-11 11-5-5" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "image-off": (
    <>
      <path d="M21 15V5a2 2 0 0 0-2-2H9M3 3l18 18" />
      <path d="M3 7v12a2 2 0 0 0 2 2h12M8.5 10.5 3 17" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-4.5-4.5L4 21" />
    </>
  ),
  type: <path d="M4 7V5h16v2M9 19h6M12 5v14" />,
  "bring-front": (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>
  ),
  "send-back": (
    <>
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M20 8v10a2 2 0 0 1-2 2H8" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.7 12a2 2 0 0 1-2 2H8.7a2 2 0 0 1-2-2L6 7" />,
  crop: <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />,
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.12 8.12 20 20M8.12 15.88 20 4" />
    </>
  ),
  bold: <path d="M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z" />,
  italic: <path d="M19 4h-9M14 20H5M15 4 9 20" />,
  underline: <path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" />,
  "align-left": <path d="M4 6h16M4 12h10M4 18h13" />,
  "align-center": <path d="M4 6h16M7 12h10M5 18h14" />,
  "align-right": <path d="M4 6h16M10 12h10M7 18h13" />,
  strikethrough: <path d="M4 12h16M6 7a4 4 0 0 1 4-3h4a4 4 0 0 1 3 2M8 17a4 4 0 0 0 4 3h2a4 4 0 0 0 4-3" />,
  "flip-h": (
    <>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M8 8 4 12l4 4V8ZM16 8l4 4-4 4V8Z" />
    </>
  ),
  "flip-v": (
    <>
      <path d="M3 12h18" strokeDasharray="3 3" />
      <path d="M8 8 12 4l4 4H8ZM8 16l4 4 4-4H8Z" />
    </>
  ),
  "center-h": (
    <>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <rect x="5" y="8" width="14" height="8" rx="1.5" />
    </>
  ),
  "center-v": (
    <>
      <path d="M3 12h18" strokeDasharray="3 3" />
      <rect x="8" y="5" width="8" height="14" rx="1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="11" width="15" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="11" width="15" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  "layer-forward": (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 15 9 5 9-5" opacity="0.5" />
    </>
  ),
  "layer-backward": (
    <>
      <path d="m12 11 9 5-9 5-9-5 9-5Z" />
      <path d="m3 8 9-5 9 5" opacity="0.5" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  layers: <path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" />,
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Tooltip wrapper — a lightweight CSS tooltip on hover/focus.
 * ------------------------------------------------------------------ */

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  size = 18,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  size?: number;
}) {
  const tone = danger
    ? "text-neutral-400 hover:text-red-300 hover:bg-red-500/10"
    : active
    ? "text-white bg-white/10"
    : "text-neutral-400 hover:text-white hover:bg-white/10";
  return (
    <span className="group/tt relative inline-flex">
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400 ${tone}`}
      >
        <Icon name={icon} size={size} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tt:opacity-100">
        {label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Switch — real sliding-knob toggle (accent when on).
 * ------------------------------------------------------------------ */

export function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 ${
        on ? "bg-[var(--accent)]" : "bg-white/12 hover:bg-white/20"
      }`}
    >
      <span
        className="inline-block h-[14px] w-[14px] transform rounded-full bg-white shadow-sm transition-transform duration-150"
        style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * NumberField — compact, borderless-until-hover, drag-to-scrub label.
 * Renders as a <label> so existing text-based selectors keep working.
 * ------------------------------------------------------------------ */

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  precision = 0,
  scrubStep,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  precision?: number;
  scrubStep?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const scrub = useRef<{ startX: number; startVal: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!focused) setText(precision > 0 ? String(value) : String(Math.round(value)));
  }, [value, focused, precision]);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(clamp(n));
  };

  const per = scrubStep ?? (step < 1 ? step : 1);

  const onLabelPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrub.current = { startX: e.clientX, startVal: value, moved: false };
  };
  const onLabelPointerMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 2) s.moved = true;
    const next = clamp(s.startVal + Math.round(dx / 3) * per);
    onChange(precision > 0 ? next : Math.round(next));
  };
  const onLabelPointerUp = (e: React.PointerEvent) => {
    if (scrub.current) (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    scrub.current = null;
  };

  return (
    <label className="group/nf flex min-w-0 flex-1 items-center gap-1 rounded-md bg-white/[0.04] px-2 py-[5px] text-[13px] transition-colors duration-150 hover:bg-white/[0.07] focus-within:bg-white/[0.07] focus-within:ring-1 focus-within:ring-[var(--accent)]/70">
      <span
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        className="shrink-0 cursor-ew-resize select-none text-[11px] font-medium text-neutral-400 group-hover/nf:text-neutral-300"
        title={`${label} — drag to adjust`}
      >
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums text-neutral-100 outline-none"
      />
      {unit && <span className="shrink-0 text-[11px] text-neutral-500">{unit}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * ColorSwatch — button opening a popover with native picker + hex.
 * ------------------------------------------------------------------ */

export function ColorSwatch({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md bg-white/[0.04] p-1 transition-colors duration-150 hover:bg-white/[0.08] ${
          compact ? "" : "pr-2"
        }`}
      >
        <span
          className="h-5 w-5 rounded-[5px] ring-1 ring-inset ring-white/15"
          style={{ background: value }}
        />
        {!compact && (
          <span className="text-[12px] tabular-nums uppercase text-neutral-300">{value}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-white/10 bg-neutral-800/95 p-2.5 shadow-xl backdrop-blur">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-20 w-full cursor-pointer rounded-lg border-0 bg-transparent p-0"
          />
          <div className="mt-2 flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1">
            <span className="text-[12px] text-neutral-500">#</span>
            <input
              value={value.replace(/^#/, "")}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                if (v.length === 6) onChange("#" + v);
              }}
              className="w-full bg-transparent text-[12px] uppercase tabular-nums text-neutral-100 outline-none"
              maxLength={6}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const families =
    value && !GOOGLE_FONTS.includes(value) ? [value, ...GOOGLE_FONTS] : GOOGLE_FONTS;
  const filtered = families.filter((f) =>
    f.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (open) ensureGoogleFonts(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        className="flex w-full items-center justify-between rounded-md bg-white/[0.05] px-2.5 py-2 text-[13px] text-neutral-100 transition-colors duration-150 hover:bg-white/[0.09]"
        style={{ fontFamily: `"${value}", sans-serif` }}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
      >
        <span className="truncate">{value || "Select font"}</span>
        <Icon name="chevron-down" size={15} className="ml-2 shrink-0 text-neutral-500" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-neutral-800/95 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-2">
            <Icon name="search" size={15} className="shrink-0 text-neutral-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              className="w-full bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.map((f) => {
              const cur = f === value;
              return (
                <li key={f}>
                  <button
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[14px] transition-colors duration-100 ${
                      cur ? "bg-[var(--accent-soft)] text-white" : "text-neutral-200 hover:bg-white/[0.06]"
                    }`}
                    style={{ fontFamily: `"${f}", sans-serif` }}
                    onClick={() => {
                      onChange(f);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{f}</span>
                    {cur && <Icon name="check" size={15} className="ml-2 shrink-0 text-[var(--accent)]" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-2.5 text-[12px] text-neutral-500">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small section header treatment.
 * ------------------------------------------------------------------ */

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-neutral-400">{children}</span>
      {right}
    </div>
  );
}

/* Shared button styles */
export const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-300 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";

export const accentBtn =
  "inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors duration-150 hover:brightness-110";

export const segItem = (active: boolean) =>
  `inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] px-1.5 text-[12px] font-medium transition-colors duration-150 ${
    active ? "bg-[var(--accent)] text-white" : "text-neutral-300 hover:bg-white/10"
  }`;

export type _Css = CSSProperties;
