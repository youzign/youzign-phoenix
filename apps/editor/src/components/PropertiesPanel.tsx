import { useEffect, useRef, useState } from "react";
import {
  textColorHex,
  shapeFillHex,
  curveAmount,
  GOOGLE_FONTS,
  fontPatch,
  type ItemPatch,
} from "@youzign/editor-core";
import { signedIntToHex, hexToSignedInt } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { ensureGoogleFonts } from "../fonts.js";
import {
  Icon,
  IconButton,
  Switch,
  NumberField,
  ColorSwatch,
  SectionLabel,
  type IconName,
} from "./ui.js";

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  "text-curved": "Curved text",
  image: "Image",
  clipart: "Graphic",
  group: "Group",
};

function FontPicker({
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

function Divider() {
  return <div className="h-px w-full bg-white/[0.06]" />;
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-neutral-300"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function OpsSection() {
  const dup = useEditor((s) => s.duplicateSelected);
  const del = useEditor((s) => s.deleteSelected);
  const front = useEditor((s) => s.bringToFront);
  const back = useEditor((s) => s.sendToBack);
  return (
    <section className="flex flex-col gap-2">
      <Divider />
      <div className="flex items-center gap-1">
        <IconButton icon="bring-front" label="Bring to front" onClick={front} />
        <IconButton icon="send-back" label="Send to back" onClick={back} />
        <IconButton icon="copy" label="Duplicate" onClick={dup} />
        <div className="ml-auto">
          <IconButton icon="trash" label="Delete" onClick={del} danger />
        </div>
      </div>
    </section>
  );
}

/** A shadow / border / blur block: header (label + switch) then controls. */
function EffectBlock({
  label,
  on,
  onToggle,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel right={<Switch on={on} onChange={onToggle} />}>{label}</SectionLabel>
      {on && children}
    </div>
  );
}

/** Legacy BlendMode.ts order (16 CSS mix-blend-mode values). */
const BLEND_MODES: { label: string; value: string }[] = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
  { label: "Color Dodge", value: "color-dodge" },
  { label: "Color Burn", value: "color-burn" },
  { label: "Hard Light", value: "hard-light" },
  { label: "Soft Light", value: "soft-light" },
  { label: "Difference", value: "difference" },
  { label: "Exclusion", value: "exclusion" },
  { label: "Hue", value: "hue" },
  { label: "Saturation", value: "saturation" },
  { label: "Color", value: "color" },
  { label: "Luminosity", value: "luminosity" },
];

function BlendModeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value || "normal"}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md bg-white/[0.05] px-2.5 py-2 text-[13px] text-neutral-100 outline-none transition-colors duration-150 hover:bg-white/[0.09] focus:bg-white/[0.09]"
    >
      {BLEND_MODES.map((m) => (
        <option key={m.value} value={m.value} className="bg-neutral-800 text-neutral-100">
          {m.label}
        </option>
      ))}
    </select>
  );
}

/** Uniform + expandable per-corner radius for images (legacy inputCorner*). */
function CornerRadiusBlock({ any, patch }: { any: any; patch: (p: ItemPatch) => void }) {
  const individual = !!any.isCornerRadiusIndividual;
  const tl = Math.round(any.inputCornerTopLeft ?? 0);
  const setAll = (v: number) =>
    patch({
      inputCornerTopLeft: v,
      inputCornerTopRight: v,
      inputCornerBottomLeft: v,
      inputCornerBottomRight: v,
    });
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel
        right={
          <button
            title={individual ? "Uniform radius" : "Per-corner radius"}
            aria-label="Toggle per-corner radius"
            onClick={() => patch({ isCornerRadiusIndividual: !individual })}
            className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] transition-colors duration-150 ${
              individual
                ? "bg-[var(--accent)] text-white"
                : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1]"
            }`}
          >
            {individual ? "Per corner" : "Uniform"}
          </button>
        }
      >
        Corner radius
      </SectionLabel>
      {individual ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Top L"
            value={Math.round(any.inputCornerTopLeft ?? 0)}
            onChange={(v) => patch({ inputCornerTopLeft: Math.max(0, v) })}
            min={0}
          />
          <NumberField
            label="Top R"
            value={Math.round(any.inputCornerTopRight ?? 0)}
            onChange={(v) => patch({ inputCornerTopRight: Math.max(0, v) })}
            min={0}
          />
          <NumberField
            label="Bot L"
            value={Math.round(any.inputCornerBottomLeft ?? 0)}
            onChange={(v) => patch({ inputCornerBottomLeft: Math.max(0, v) })}
            min={0}
          />
          <NumberField
            label="Bot R"
            value={Math.round(any.inputCornerBottomRight ?? 0)}
            onChange={(v) => patch({ inputCornerBottomRight: Math.max(0, v) })}
            min={0}
          />
        </div>
      ) : (
        <NumberField
          label="Radius"
          value={tl}
          onChange={(v) => setAll(Math.max(0, v))}
          min={0}
          unit="px"
        />
      )}
    </div>
  );
}

function EffectsSection({ any, patch }: { any: any; patch: (p: ItemPatch) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <Divider />

      {any.type === "image" && <CornerRadiusBlock any={any} patch={patch} />}

      <div className="flex flex-col gap-2.5">
        <SectionLabel>Blend mode</SectionLabel>
        <BlendModeSelect
          value={any.blendMode ?? "normal"}
          onChange={(v) => patch({ blendMode: v })}
        />
      </div>

      <EffectBlock
        label="Invert"
        on={!!any.isInvert}
        onToggle={() =>
          patch({
            isInvert: !any.isInvert,
            // Legacy: turning invert on with 0 intensity seeds it to 100.
            ...(!any.isInvert && !(any.invertIntensity > 0)
              ? { invertIntensity: 100 }
              : {}),
          })
        }
      >
        <NumberField
          label="Intensity"
          value={Math.round(any.invertIntensity ?? 100)}
          onChange={(v) => patch({ invertIntensity: Math.min(100, Math.max(0, v)) })}
          min={0}
          max={100}
          unit="%"
        />
      </EffectBlock>

      <EffectBlock
        label="Shadow"
        on={!!any.isShadow}
        onToggle={() => patch({ isShadow: !any.isShadow })}
      >
        <div className="flex flex-col gap-2.5">
          <Field label="Color">
            <ColorSwatch
              value={signedIntToHex(any.shadowColor ?? 0)}
              onChange={(hex) => patch({ shadowColor: hexToSignedInt(hex) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Opacity"
              value={Number(any.shadowOpacity ?? 0)}
              onChange={(v) => patch({ shadowOpacity: v })}
              min={0}
              max={1}
              step={0.05}
              precision={2}
            />
            <NumberField
              label="Dist"
              value={Math.round(any.shadowDistance ?? 0)}
              onChange={(v) => patch({ shadowDistance: v })}
              min={0}
            />
            <NumberField
              label="Angle"
              value={Math.round(any.shadowAngle ?? 0)}
              onChange={(v) => patch({ shadowAngle: v })}
              unit="°"
            />
          </div>
        </div>
      </EffectBlock>

      <EffectBlock
        label="Border"
        on={!!any.isBorder}
        onToggle={() => patch({ isBorder: !any.isBorder })}
      >
        <div className="flex flex-col gap-2.5">
          <Field label="Color">
            <ColorSwatch
              value={signedIntToHex(any.borderColor ?? 0)}
              onChange={(hex) => patch({ borderColor: hexToSignedInt(hex) })}
            />
          </Field>
          <NumberField
            label="Width"
            value={Math.round(any.borderSize ?? 0)}
            onChange={(v) => patch({ borderSize: v })}
            min={0}
            unit="px"
          />
        </div>
      </EffectBlock>

      <EffectBlock
        label="Blur"
        on={!!any.isBlur}
        onToggle={() => patch({ isBlur: !any.isBlur })}
      >
        <NumberField
          label="Amount"
          value={Math.round(any.blurSize ?? 0)}
          onChange={(v) => patch({ blurSize: v })}
          min={0}
          unit="px"
        />
      </EffectBlock>
    </section>
  );
}

/** Segmented toggle group of icon buttons. */
function ToggleGroup<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: { key: T; icon: IconName; label: string }[];
  value: T | null;
  onSelect: (k: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            title={o.label}
            aria-label={o.label}
            onClick={() => onSelect(o.key)}
            className={`inline-flex h-7 flex-1 items-center justify-center rounded-md transition-colors duration-150 ${
              active ? "bg-[var(--accent)] text-white shadow-sm" : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Icon name={o.icon} size={16} />
          </button>
        );
      })}
    </div>
  );
}

export function PropertiesPanel() {
  const item = useEditor((s) => s.selectedItem());
  const selectedCount = useEditor((s) => s.selectedUids.length);
  const patch = useEditor((s) => s.patchSelected);
  const recolor = useEditor((s) => s.recolorSelected);
  const setCurveByUid = useEditor((s) => s.setCurveByUid);
  const beginCrop = useEditor((s) => s.beginCrop);
  const removeBg = useEditor((s) => s.removeBg);
  const bgProcessingUids = useEditor((s) => s.bgProcessingUids);
  const bgStage = useEditor((s) => s.bgStage);
  const bgError = useEditor((s) => s.bgError);

  if (selectedCount === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 pt-16 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-neutral-500">
          <Icon name="shapes" size={20} />
        </div>
        <p className="text-[12px] leading-relaxed text-neutral-500">
          Nothing selected.<br />Click an item on the canvas to edit it.
        </p>
      </div>
    );
  }

  if (selectedCount > 1 || !item) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-[12px] font-medium text-neutral-300">
          {selectedCount} items selected
        </div>
        <OpsSection />
      </div>
    );
  }

  const any = item as any;
  const bgBusy = bgProcessingUids.includes(any._uid);
  const isTextItem = item.type === "text" || item.type === "text-curved";
  const isClipart = item.type === "clipart";
  const showFill = isTextItem || isClipart;
  const fillHex = isTextItem
    ? textColorHex(item as any)
    : isClipart
    ? shapeFillHex(item as any)
    : "#000000";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {TYPE_LABELS[item.type] ?? item.type}
      </div>

      {/* geometry */}
      {"xpos" in any && (
        <section className="grid grid-cols-2 gap-2">
          {!isTextItem && (
            <>
              <NumberField
                label="W"
                value={Math.round(any.width)}
                onChange={(v) => patch({ width: v })}
              />
              <NumberField
                label="H"
                value={Math.round(any.height)}
                onChange={(v) => patch({ height: v })}
              />
            </>
          )}
          <NumberField
            label="Angle"
            value={Math.round(any.rotation)}
            onChange={(v) => patch({ rotation: v })}
            unit="°"
          />
          <NumberField
            label="Opacity"
            value={Number(any.opacity)}
            onChange={(v) => patch({ opacity: v })}
            min={0}
            max={1}
            step={0.05}
            precision={2}
          />
        </section>
      )}

      {/* text properties */}
      {isTextItem && (
        <section className="flex flex-col gap-3">
          <Divider />
          <FontPicker
            value={any.font}
            onChange={(family) => {
              ensureGoogleFonts([family]);
              patch(fontPatch(family));
            }}
          />
          <div className="flex items-center gap-2">
            <NumberField
              label="Size"
              value={Math.round(any.size)}
              onChange={(v) => patch({ size: v })}
              min={1}
              unit="px"
            />
          </div>
          {/* style toggles are independent, not exclusive — render manually */}
          <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            {([
              { key: "bold", icon: "bold" as IconName, label: "Bold", on: !!any.bold },
              { key: "italic", icon: "italic" as IconName, label: "Italic", on: !!any.italic },
              { key: "underline", icon: "underline" as IconName, label: "Underline", on: !!any.underline },
            ]).map((o) => (
              <button
                key={o.key}
                title={o.label}
                aria-label={o.label}
                onClick={() => patch({ [o.key]: !o.on } as ItemPatch)}
                className={`inline-flex h-7 flex-1 items-center justify-center rounded-md transition-colors duration-150 ${
                  o.on ? "bg-[var(--accent)] text-white shadow-sm" : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <Icon name={o.icon} size={16} />
              </button>
            ))}
          </div>
          <ToggleGroup
            options={[
              { key: "left", icon: "align-left", label: "Align left" },
              { key: "center", icon: "align-center", label: "Align center" },
              { key: "right", icon: "align-right", label: "Align right" },
            ]}
            value={any.alignment ?? "left"}
            onSelect={(a) => patch({ alignment: a })}
          />
        </section>
      )}

      {/* curved text arc */}
      {item.type === "text-curved" && (
        <section className="flex flex-col gap-2">
          <Divider />
          <SectionLabel right={<span className="text-[12px] tabular-nums text-neutral-300">{curveAmount(any)}</span>}>
            Curve
          </SectionLabel>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={curveAmount(any)}
            onChange={(e) => setCurveByUid(any._uid, Number(e.target.value))}
            className="yz-range"
          />
          <div className="flex justify-between text-[10px] text-neutral-600">
            <span>▽ down</span>
            <span>straight</span>
            <span>△ up</span>
          </div>
        </section>
      )}

      {/* image crop + background removal */}
      {item.type === "image" && (
        <section className="flex flex-col gap-1.5">
          <Divider />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-2 text-[12.5px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
              onClick={() => beginCrop(any._uid)}
              disabled={bgBusy}
            >
              <Icon name="crop" size={15} /> Crop image
            </button>
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-2 text-[12.5px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white disabled:cursor-progress disabled:opacity-70"
              onClick={() => removeBg(any._uid)}
              disabled={bgBusy}
            >
              {bgBusy ? (
                <>
                  <Spinner /> {bgStage === "model" ? "Loading model…" : "Removing…"}
                </>
              ) : (
                <>
                  <Icon name="scissors" size={15} /> Remove bg
                </>
              )}
            </button>
          </div>
          {bgError && bgError.uid === any._uid ? (
            <p className="text-[10px] leading-relaxed text-rose-400">{bgError.message}</p>
          ) : (
            <p className="text-[10px] leading-relaxed text-neutral-500">
              Removes the background on your device. Downloads a ~4.5MB model once, then runs offline.
            </p>
          )}
          {any.cropped && (
            <p className="text-[10px] text-neutral-500">Cropped · double-click to re-crop</p>
          )}
        </section>
      )}

      {/* fill */}
      {showFill && (
        <section className="flex flex-col gap-2.5">
          <Divider />
          <Field label="Fill">
            <ColorSwatch value={fillHex} onChange={(hex) => recolor(hex)} />
          </Field>
        </section>
      )}

      {/* effects */}
      {"xpos" in any && <EffectsSection any={any} patch={patch} />}

      {/* z-order + ops */}
      <OpsSection />
    </div>
  );
}
