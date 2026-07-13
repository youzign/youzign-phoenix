import { useEffect, useRef, useState } from "react";
import {
  textColorHex,
  shapeFillHex,
  isShape,
  isShapeNoFill,
  curveAmount,
  fontPatch,
  canvasAdjustmentsNeutral,
  GRADIENT_PRESETS,
  GRADIENT_ANGLES,
  backgroundColorHex,
  gradientStopHex,
  borderColorHex,
  TEXT_EFFECTS,
  textEffectPatch,
  detectTextEffect,
  type CanvasAdjustmentKey,
  type ItemPatch,
} from "@youzign/editor-core";
import { signedIntToHex, hexToSignedInt, type FilterItem } from "@youzign/designstring";
import { FILTER_NAMES, VIGNETTE_BACKGROUND, filterRecipe } from "@youzign/renderer";
import { useEditor } from "../store.js";
import { getKey } from "../library/settings.js";
import { FAL_KEY_URL } from "../library/generate.js";
import type { MagicExpandRatio } from "../magic/endpoints.js";
import { ensureGoogleFonts } from "../fonts.js";
import { asset } from "../asset.js";
import {
  Icon,
  IconButton,
  Switch,
  NumberField,
  ColorSwatch,
  FontPicker,
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

const EXPAND_RATIOS: { ratio: MagicExpandRatio; label: string; title: string }[] = [
  { ratio: "1:1", label: "1:1", title: "Expand to a square" },
  { ratio: "4:5", label: "4:5", title: "Expand to portrait 4:5" },
  { ratio: "16:9", label: "16:9", title: "Expand to widescreen 16:9" },
  { ratio: "9:16", label: "9:16", title: "Expand to vertical 9:16" },
  { ratio: "free", label: "Canvas", title: "Use the current canvas ratio" },
];

const MODERN_FILTER_IDS = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28] as const;

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

const ADJUST_SLIDERS: {
  key: CanvasAdjustmentKey;
  label: string;
  min: number;
  max: number;
  unit?: string;
}[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "hue", label: "Hue", min: -180, max: 180, unit: "deg" },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
];

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

function filterThumbStyle(filterid: number): React.CSSProperties {
  if (filterid <= 1) return {};
  const recipe = filterRecipe(filterid, 1);
  return { filter: recipe.canvasFilter };
}

function filterThumbOverlay(filterid: number) {
  if (filterid <= 1) return null;
  const layer = filterRecipe(filterid, 1).layers[0];
  if (!layer) return null;
  return (
    <span
      className="pointer-events-none absolute inset-0"
      style={{
        background: layer.background ?? VIGNETTE_BACKGROUND,
        mixBlendMode: layer.blendMode as React.CSSProperties["mixBlendMode"],
        opacity: layer.opacity,
      }}
    />
  );
}

function adjustmentValue(item: FilterItem | undefined, key: CanvasAdjustmentKey): number {
  if (!item) return 0;
  switch (key) {
    case "brightness":
      return item.adjBrightness;
    case "contrast":
      return item.adjContrast;
    case "saturation":
      return item.adjSaturation;
    case "hue":
      return item.adjHue;
    case "warmth":
      return item.adjWarmth;
    case "vignette":
      return item.adjVignette;
  }
}

function SliderCommit({
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className="yz-range"
    />
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

/** Flip / center / lock / one-step z-order — the parity "basket" controls. */
function ArrangeSection({ uid }: { uid: number }) {
  const patch = useEditor((s) => s.patchSelected);
  const center = useEditor((s) => s.centerSelected);
  const forward = useEditor((s) => s.bringForward);
  const backward = useEditor((s) => s.sendBackward);
  const toggleLock = useEditor((s) => s.toggleLockSelected);
  const locked = useEditor((s) => s.lockedUids.includes(uid));
  const item = useEditor((s) => s.selectedItem());
  const hFlip = !!(item as any)?.hFlip;
  const vFlip = !!(item as any)?.vFlip;
  return (
    <section className="flex flex-col gap-2">
      <Divider />
      <SectionLabel>Arrange</SectionLabel>
      <div className="flex items-center gap-1">
        <IconButton icon="flip-h" label="Flip horizontal" active={hFlip} onClick={() => patch({ hFlip: !hFlip })} />
        <IconButton icon="flip-v" label="Flip vertical" active={vFlip} onClick={() => patch({ vFlip: !vFlip })} />
        <IconButton icon="center-h" label="Center horizontally" onClick={() => center("h")} />
        <IconButton icon="center-v" label="Center vertically" onClick={() => center("v")} />
        <IconButton icon="layer-forward" label="Bring forward" onClick={forward} />
        <IconButton icon="layer-backward" label="Send backward" onClick={backward} />
        <div className="ml-auto">
          <IconButton
            icon={locked ? "lock" : "unlock"}
            label={locked ? "Unlock" : "Lock"}
            active={locked}
            onClick={toggleLock}
          />
        </div>
      </div>
    </section>
  );
}

/** Checkered "No fill" swatch + solid Fill picker for parametric shapes. */
function ShapeFill({
  fillHex,
  noFill,
  onColor,
  onNoFill,
}: {
  fillHex: string;
  noFill: boolean;
  onColor: (hex: string) => void;
  onNoFill: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="No fill (transparent)"
        aria-label="No fill"
        onClick={onNoFill}
        className={`h-7 w-7 shrink-0 rounded-md ring-1 ring-inset transition-colors duration-150 ${
          noFill ? "ring-[var(--accent)]" : "ring-white/15 hover:ring-white/30"
        }`}
        style={{
          backgroundColor: "#fff",
          backgroundImage:
            "linear-gradient(45deg,#c8ccd4 25%,transparent 25%),linear-gradient(-45deg,#c8ccd4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8ccd4 75%),linear-gradient(-45deg,transparent 75%,#c8ccd4 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
        }}
      />
      <div className={noFill ? "opacity-50" : ""}>
        <ColorSwatch value={fillHex} onChange={onColor} />
      </div>
    </div>
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
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <NumberField
              label="Radius"
              value={tl}
              onChange={(v) => setAll(Math.max(0, v))}
              min={0}
              unit="px"
            />
          </div>
          {[10, 20, 40].map((v) => (
            <button
              key={v}
              onClick={() => setAll(v)}
              className={`h-7 rounded-md px-2 text-[11px] tabular-nums transition-colors duration-150 ${
                tl === v
                  ? "bg-[var(--accent)] text-white"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Preset text effects — each maps to a legacy border/shadow/fill attr combo
 * (text-effects.ts). Selecting a chip overwrites those attrs; the Border/Shadow
 * sections below still expose the raw controls for custom tuning. */
function TextEffectsRow({ any, patch }: { any: any; patch: (p: ItemPatch) => void }) {
  const active = detectTextEffect(any);
  const hex = textColorHex(any);
  return (
    <div>
      <SectionLabel>Effects</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {TEXT_EFFECTS.map((e) => {
          const on = active === e.id;
          return (
            <button
              key={e.id}
              onClick={() => patch(textEffectPatch(e.id, hex))}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150 ${
                on
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white"
              }`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
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

const ANGLE_LABEL: Record<number, string> = {
  90: "↑",
  45: "↗",
  0: "→",
  "-45": "↘",
  "-90": "↓",
  "-135": "↙",
  180: "←",
  135: "↖",
};

/** Canvas background editor — shown when nothing is selected. */
function CanvasPanel() {
  const design = useEditor((s) => s.design);
  const name = useEditor((s) => s.designName);
  const setBgColor = useEditor((s) => s.setBgColor);
  const setBgTransparent = useEditor((s) => s.setBgTransparent);
  const applyPreset = useEditor((s) => s.applyGradientPreset);
  const setStop = useEditor((s) => s.setGradientStopColor);
  const setMode = useEditor((s) => s.setGradientMode);
  const setAngle = useEditor((s) => s.setBgGradientAngle);
  const reverse = useEditor((s) => s.reverseBgGradient);
  const setBorderWidth = useEditor((s) => s.setCanvasBorderWidth);
  const setBorderColor = useEditor((s) => s.setCanvasBorderColor);
  const setCanvasFilter = useEditor((s) => s.setCanvasFilter);
  const setCanvasFilterAlpha = useEditor((s) => s.setCanvasFilterAlpha);
  const setCanvasAdjustment = useEditor((s) => s.setCanvasAdjustment);
  const resetCanvasAdjustments = useEditor((s) => s.resetCanvasAdjustments);

  const isGradient = design.bgType === "gradient";
  const transparent = !!design.transparent;
  const filterItem = design.items.find((it) => it.type === "filter") as FilterItem | undefined;
  const activeFilterId = filterItem?.filterid ?? 1;
  const hasLegacyFilter = activeFilterId >= 2 && activeFilterId <= 15;
  const hasAdjustments = !canvasAdjustmentsNeutral(filterItem);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Canvas
        </div>
        <div className="truncate text-[13px] font-medium text-neutral-200">{name}</div>
        <div className="text-[12px] tabular-nums text-neutral-500">
          {Math.round(design.canvasWidth)} × {Math.round(design.canvasHeight)} px
        </div>
      </div>

      <Divider />

      {/* background type */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Background</SectionLabel>
        <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
          {([
            { key: "color", label: "Solid" },
            { key: "gradient", label: "Gradient" },
          ] as const).map((o) => {
            const active = !transparent && (o.key === "gradient" ? isGradient : !isGradient);
            return (
              <button
                key={o.key}
                onClick={() =>
                  o.key === "gradient" ? applyGradientDefault() : setBgColor(backgroundColorHex(design))
                }
                className={`inline-flex h-7 flex-1 items-center justify-center rounded-md text-[12px] font-medium transition-colors duration-150 ${
                  active ? "bg-[var(--accent)] text-white shadow-sm" : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* solid color */}
        {!isGradient && !transparent && (
          <Field label="Color">
            <ColorSwatch value={backgroundColorHex(design)} onChange={(hex) => setBgColor(hex)} />
          </Field>
        )}

        {/* gradient editor */}
        {isGradient && !transparent && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-6 gap-1.5">
              {GRADIENT_PRESETS.map(([a, b], i) => (
                <button
                  key={i}
                  title={`Gradient ${i + 1}`}
                  onClick={() => applyPreset(i)}
                  className="h-7 rounded-md ring-1 ring-inset ring-white/10 transition-transform duration-100 hover:scale-105"
                  style={{ background: `linear-gradient(180deg, ${a} 0%, ${b} 100%)` }}
                />
              ))}
            </div>

            <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
              {([
                { key: true, label: "Linear" },
                { key: false, label: "Radial" },
              ] as const).map((o) => {
                const active = design.isLinear === o.key;
                return (
                  <button
                    key={String(o.key)}
                    onClick={() => setMode(o.key)}
                    className={`inline-flex h-7 flex-1 items-center justify-center rounded-md text-[12px] font-medium transition-colors duration-150 ${
                      active ? "bg-[var(--accent)] text-white shadow-sm" : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            {design.isLinear && (
              <div className="grid grid-cols-8 gap-1">
                {GRADIENT_ANGLES.map((a) => {
                  const active = design.angle === a;
                  return (
                    <button
                      key={a}
                      title={`${a}°`}
                      onClick={() => setAngle(a)}
                      className={`flex h-7 items-center justify-center rounded-md text-[13px] transition-colors duration-150 ${
                        active ? "bg-[var(--accent)] text-white" : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      {ANGLE_LABEL[a] ?? a}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <ColorSwatch value={gradientStopHex(design, 1)} onChange={(hex) => setStop(1, hex)} />
              </Field>
              <Field label="End">
                <ColorSwatch value={gradientStopHex(design, 2)} onChange={(hex) => setStop(2, hex)} />
              </Field>
            </div>

            <button
              onClick={reverse}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-2 text-[12.5px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white"
            >
              <Icon name="redo" size={15} /> Reverse colors
            </button>
          </div>
        )}
      </section>

      <Divider />

      <section className="flex flex-col gap-3">
        <SectionLabel>Filter</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {hasLegacyFilter && (
            <button
              type="button"
              data-preset-id={activeFilterId}
              onClick={() => setCanvasFilter(activeFilterId)}
              className="rounded-md bg-white/[0.04] p-1 text-left ring-2 ring-[var(--accent)] transition-colors duration-150 hover:bg-white/[0.08]"
            >
              <span className="relative block aspect-square overflow-hidden rounded-[5px] bg-neutral-800">
                <img src={asset("/demo-portrait.jpg")} alt="" className="h-full w-full object-cover" style={filterThumbStyle(activeFilterId)} />
                {filterThumbOverlay(activeFilterId)}
              </span>
              <span className="mt-1 block truncate text-[10.5px] font-medium text-neutral-100">
                Legacy — {FILTER_NAMES[activeFilterId]}
              </span>
            </button>
          )}
          <button
            type="button"
            data-preset-id="1"
            onClick={() => setCanvasFilter(null)}
            className={`rounded-md bg-white/[0.04] p-1 text-left transition-colors duration-150 hover:bg-white/[0.08] ${
              activeFilterId <= 1 && !hasAdjustments ? "ring-2 ring-[var(--accent)]" : "ring-1 ring-inset ring-white/10"
            }`}
          >
            <span className="relative block aspect-square overflow-hidden rounded-[5px] bg-neutral-800">
              <img src={asset("/demo-portrait.jpg")} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="mt-1 block truncate text-[10.5px] font-medium text-neutral-200">Original</span>
          </button>
          {MODERN_FILTER_IDS.map((id) => {
            const active = activeFilterId === id;
            return (
              <button
                key={id}
                type="button"
                data-preset-id={id}
                onClick={() => setCanvasFilter(id)}
                className={`rounded-md bg-white/[0.04] p-1 text-left transition-colors duration-150 hover:bg-white/[0.08] ${
                  active ? "ring-2 ring-[var(--accent)]" : "ring-1 ring-inset ring-white/10"
                }`}
              >
                <span className="relative block aspect-square overflow-hidden rounded-[5px] bg-neutral-800">
                  <img src={asset("/demo-portrait.jpg")} alt="" className="h-full w-full object-cover" style={filterThumbStyle(id)} />
                  {filterThumbOverlay(id)}
                </span>
                <span className="mt-1 block truncate text-[10.5px] font-medium text-neutral-200">{FILTER_NAMES[id]}</span>
              </button>
            );
          })}
        </div>

        {activeFilterId > 1 && filterItem && (
          <div className="flex flex-col gap-2">
            <SectionLabel right={<span className="text-[12px] tabular-nums text-neutral-300">{Math.round(filterItem.opacity * 100)}%</span>}>
              Intensity
            </SectionLabel>
            <SliderCommit
              min={0}
              max={100}
              value={Math.round(filterItem.opacity * 100)}
              onCommit={(value) => setCanvasFilterAlpha(value / 100)}
            />
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <SectionLabel
            right={
              hasAdjustments ? (
                <button
                  type="button"
                  onClick={resetCanvasAdjustments}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                >
                  Reset
                </button>
              ) : null
            }
          >
            Adjust
          </SectionLabel>
          {ADJUST_SLIDERS.map((slider) => {
            const value = adjustmentValue(filterItem, slider.key);
            return (
              <div key={slider.key} className="flex flex-col gap-1.5">
                <SectionLabel right={<span className="text-[12px] tabular-nums text-neutral-300">{value}{slider.unit ?? ""}</span>}>
                  {slider.label}
                </SectionLabel>
                <SliderCommit
                  min={slider.min}
                  max={slider.max}
                  value={value}
                  onCommit={(next) => setCanvasAdjustment(slider.key, next)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <Divider />

      {/* transparent */}
      <SectionLabel right={<Switch on={transparent} onChange={() => setBgTransparent(!transparent)} />}>
        Transparent
      </SectionLabel>

      <Divider />

      {/* border */}
      <section className="flex flex-col gap-2.5">
        <SectionLabel>Canvas border</SectionLabel>
        <Field label="Color">
          <ColorSwatch value={borderColorHex(design)} onChange={(hex) => setBorderColor(hex)} />
        </Field>
        <NumberField
          label="Width"
          value={Math.round(design.borderWidth)}
          onChange={(v) => setBorderWidth(v)}
          min={0}
          unit="px"
        />
      </section>
    </div>
  );

  function applyGradientDefault() {
    // Switching to gradient with no gradient yet → seed the first preset.
    if (!isGradient) applyPreset(0);
  }
}

/** Magic suite: fal-powered eraser + grab, and a fully-local background blur. */
function MagicSection({ uid }: { uid: number }) {
  const beginErase = useEditor((s) => s.beginMagicErase);
  const beginEdit = useEditor((s) => s.beginMagicEdit);
  const beginGrab = useEditor((s) => s.beginMagicGrab);
  const beginBlur = useEditor((s) => s.beginMagicBlur);
  const applyExpand = useEditor((s) => s.applyMagicExpand);
  const applyUpscale = useEditor((s) => s.applyMagicUpscale);
  const setBlurAmountLive = useEditor((s) => s.setMagicBlurAmount);
  const applyBlur = useEditor((s) => s.applyMagicBlur);
  const cancelBlur = useEditor((s) => s.cancelMagicBlur);
  const blurPreview = useEditor((s) => s.blurPreview);
  const magicBusy = useEditor((s) => s.magicBusy);
  const magicMode = useEditor((s) => s.magicMode);
  const magicStage = useEditor((s) => s.magicStage);
  const magicError = useEditor((s) => s.magicError);
  const magicNotice = useEditor((s) => s.magicNotice);
  const magicUid = useEditor((s) => s.magicUid);

  const [blurAmount, setBlurAmount] = useState(14);
  const [expandRatio, setExpandRatio] = useState<MagicExpandRatio>("free");
  const [expandPending, setExpandPending] = useState(false);
  const blurActive = blurPreview !== null && blurPreview.uid === uid;
  // Debounce live recompute of the preview as the slider drags.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBlurSlider = (v: number) => {
    setBlurAmount(v);
    if (!blurActive) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void setBlurAmountLive(v), 90);
  };
  const hasFal = !!getKey("fal");
  const busy = magicBusy;
  const stageLabel =
    magicStage === "segment" ? "Finding subject…" :
    magicStage === "extract" ? "Lifting subject…" :
    magicStage === "erasing" ? "Erasing…" :
    magicStage === "editing" ? "Editing…" :
    magicStage === "expanding" ? "Expanding…" :
    magicStage === "enhancing" ? "Enhancing…" :
    magicStage === "blur" ? "Blurring…" :
    magicStage === "cutout" || magicStage === "load" || magicStage === "model" || magicStage === "infer" ? "Analysing…" :
    "Working…";

  const btn =
    "inline-flex flex-col items-center justify-center gap-1 rounded-md bg-white/[0.05] px-2 py-2.5 text-[11px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white disabled:opacity-40 disabled:hover:bg-white/[0.05]";
  const activeBtn = "ring-1 ring-[var(--accent)] bg-[var(--accent)]/15 text-white";

  useEffect(() => {
    if (!expandPending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandPending(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandPending]);

  useEffect(() => {
    setExpandPending(false);
  }, [uid]);

  async function applyPendingExpand() {
    await applyExpand(uid, expandRatio);
    setExpandPending(false);
  }

  return (
    <section className="flex flex-col gap-1.5">
      <Divider />
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="sparkles" size={13} /> A.I.
        </span>
      </SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          className={`${btn} ${magicMode === "erase" && magicUid === uid ? activeBtn : ""}`}
          onClick={() => beginErase(uid)}
          disabled={busy || !hasFal}
          title="Brush over an object to remove it"
        >
          <Icon name="wand" size={16} /> Eraser
        </button>
        <button
          className={`${btn} ${magicMode === "edit" && magicUid === uid ? activeBtn : ""}`}
          onClick={() => beginEdit(uid)}
          disabled={busy || !hasFal}
          title="Brush a region and describe what should replace it"
        >
          <Icon name="sparkles" size={16} /> Edit
        </button>
        <button
          className={`${btn} ${magicMode === "grab" && magicUid === uid ? activeBtn : ""}`}
          onClick={() => beginGrab(uid)}
          disabled={busy || !hasFal}
          title="Click a subject to lift it onto its own layer"
        >
          <Icon name="sparkles" size={16} /> Grab
        </button>
        <button
          className={`${btn} ${expandPending ? activeBtn : ""}`}
          onClick={() => setExpandPending((v) => !v)}
          disabled={busy || !hasFal}
          title="Outpaint this image into a larger canvas"
        >
          <Icon name="image" size={16} /> Expand
        </button>
        <button
          className={btn}
          onClick={() => void applyUpscale(uid)}
          disabled={busy || !hasFal}
          title="Upscale and enhance the image source"
        >
          <Icon name="check" size={16} /> Enhance
        </button>
        <button
          className={`${btn} ${blurActive ? activeBtn : ""}`}
          onClick={() => (blurActive ? cancelBlur() : void beginBlur(uid, blurAmount))}
          disabled={busy && !blurActive}
          title="Blur the background, keep the subject sharp (runs on your device)"
        >
          <Icon name="droplet" size={16} /> Blur
        </button>
      </div>

      {expandPending && (
        <div className="mt-1 flex flex-col gap-2 rounded-md bg-white/[0.03] p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10.5px] font-medium text-neutral-500">
              Expand to:
            </span>
            {EXPAND_RATIOS.map((r) => (
              <button
                key={r.ratio}
                className={`rounded px-2 py-1 text-[10.5px] font-medium transition-colors ${
                  expandRatio === r.ratio
                    ? "bg-[var(--accent)] text-white"
                    : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.11]"
                }`}
                onClick={() => setExpandRatio(r.ratio)}
                disabled={busy}
                title={r.title}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-50"
              onClick={() => void applyPendingExpand()}
              disabled={busy}
            >
              Apply
            </button>
            <button
              className="inline-flex flex-1 items-center justify-center rounded-md bg-white/10 px-2 py-2 text-[12.5px] text-neutral-100 hover:bg-white/20 disabled:opacity-50"
              onClick={() => setExpandPending(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {blurActive && (
        <div className="mt-1 flex flex-col gap-2 rounded-md bg-white/[0.03] p-2.5">
          <SectionLabel
            right={
              <span className="inline-flex items-center gap-1.5 text-[12px] tabular-nums text-neutral-300">
                {blurPreview?.recomputing && <Spinner />}
                {blurAmount}px
              </span>
            }
          >
            Background blur · preview
          </SectionLabel>
          <input
            type="range"
            min={2}
            max={40}
            step={1}
            value={blurAmount}
            onChange={(e) => onBlurSlider(Number(e.target.value))}
            className="yz-range"
          />
          <div className="flex gap-1.5">
            <button
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:brightness-110"
              onClick={() => applyBlur()}
            >
              Apply ⏎
            </button>
            <button
              className="inline-flex flex-1 items-center justify-center rounded-md bg-white/10 px-2 py-2 text-[12.5px] text-neutral-100 hover:bg-white/20"
              onClick={() => cancelBlur()}
            >
              Cancel ⎋
            </button>
          </div>
        </div>
      )}

      {busy && !blurActive && (
        <p className="inline-flex items-center gap-1.5 text-[10px] text-neutral-400"><Spinner /> {stageLabel}</p>
      )}
      {magicNotice && magicNotice.uid === uid && (
        <p className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
          <Icon name="check" size={12} /> {magicNotice.message}
        </p>
      )}
      {magicError && magicError.uid === uid ? (
        <p className="text-[10px] leading-relaxed text-rose-400">{magicError.message}</p>
      ) : !hasFal ? (
        <p className="text-[10px] leading-relaxed text-neutral-500">
          A.I. tools need fal.ai —{" "}
          <a href={FAL_KEY_URL} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
            Connect fal.ai
          </a>{" "}
          to use them. Blur runs free on your device.
        </p>
      ) : (
        <p className="text-[10px] leading-relaxed text-neutral-500">
          Eraser, Edit, Grab, Expand &amp; Enhance use fal.ai · Blur runs on your device.
        </p>
      )}
    </section>
  );
}

export function PropertiesPanel() {
  const item = useEditor((s) => s.selectedItem());
  const selectedCount = useEditor((s) => s.selectedUids.length);
  const patch = useEditor((s) => s.patchSelected);
  const recolor = useEditor((s) => s.recolorSelected);
  const setCurveByUid = useEditor((s) => s.setCurveByUid);
  const beginCrop = useEditor((s) => s.beginCrop);
  const setShapeNoFill = useEditor((s) => s.setSelectedShapeNoFill);
  const setTextNoFill = useEditor((s) => s.setSelectedTextNoFill);
  const removeBg = useEditor((s) => s.removeBg);
  const makeImageColorTransparent = useEditor((s) => s.makeImageColorTransparent);
  const fitCanvasToImage = useEditor((s) => s.fitCanvasToImage);
  const bgProcessingUids = useEditor((s) => s.bgProcessingUids);
  const bgStage = useEditor((s) => s.bgStage);
  const bgError = useEditor((s) => s.bgError);
  const [colorKeyTolerance, setColorKeyTolerance] = useState(40);
  const [colorKeyHex, setColorKeyHex] = useState("#3b6fd4");
  const [colorKeyAuto, setColorKeyAuto] = useState(true);

  useEffect(() => {
    setColorKeyAuto(true);
  }, [(item as any)?._uid]);

  if (selectedCount === 0) {
    return <CanvasPanel />;
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
              { key: "strikethrough", icon: "strikethrough" as IconName, label: "Strikethrough", on: !!any.strikethrough },
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
          <TextEffectsRow any={any} patch={patch} />
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
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-2 text-[12.5px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
              onClick={() => fitCanvasToImage(any._uid)}
              disabled={bgBusy}
            >
              <Icon name="crop" size={15} /> Fit to image
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
          <div className="flex flex-col gap-1.5 rounded-md bg-white/[0.025] p-2">
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-2 text-[12.5px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white disabled:cursor-progress disabled:opacity-70"
              onClick={() =>
                makeImageColorTransparent(
                  any._uid,
                  colorKeyAuto ? undefined : rgbFromHex(colorKeyHex),
                  colorKeyTolerance
                )
              }
              disabled={bgBusy}
            >
              {bgBusy && bgStage === "key" ? (
                <>
                  <Spinner /> Keying…
                </>
              ) : (
                <>
                  <Icon name="droplet" size={15} /> Color transparency
                </>
              )}
            </button>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={128}
                step={1}
                value={colorKeyTolerance}
                onChange={(e) => setColorKeyTolerance(Number(e.target.value))}
                className="yz-range min-w-0 flex-1"
                disabled={bgBusy}
                aria-label="Color transparency tolerance"
              />
              <span className="w-7 text-right text-[10px] tabular-nums text-neutral-500">
                {colorKeyTolerance}
              </span>
              <input
                type="color"
                value={colorKeyHex}
                onChange={(e) => {
                  setColorKeyHex(e.target.value);
                  setColorKeyAuto(false);
                }}
                className="h-7 w-8 rounded border border-white/10 bg-transparent"
                disabled={bgBusy}
                aria-label="Transparent color"
              />
              <button
                type="button"
                onClick={() => setColorKeyAuto(true)}
                disabled={bgBusy || colorKeyAuto}
                className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] font-medium text-neutral-300 hover:bg-white/[0.1] disabled:opacity-50"
              >
                Auto
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-neutral-500">
              Removes one color while keeping the rest. Runs on your device.
            </p>
          </div>
          {bgError && bgError.uid === any._uid ? (
            <p className="text-[10px] leading-relaxed text-rose-400">{bgError.message}</p>
          ) : (
            <p className="text-[10px] leading-relaxed text-neutral-500">
              Removes the background on your device. Downloads a ~4.5MB model once, then runs offline.
            </p>
          )}
          {any.cropped && (
            <p className="text-[10px] text-neutral-500">Cropped · use Crop image to re-crop</p>
          )}
        </section>
      )}

      {/* magic suite (fal eraser/grab + local blur) */}
      {item.type === "image" && <MagicSection uid={any._uid} />}

      {/* fill */}
      {showFill && (
        <section className="flex flex-col gap-2.5">
          <Divider />
          <Field label="Fill">
            {isShape(item) ? (
              <ShapeFill
                fillHex={fillHex}
                noFill={isShapeNoFill(item as any)}
                onColor={(hex) => recolor(hex)}
                onNoFill={setShapeNoFill}
              />
            ) : isTextItem ? (
              <ShapeFill
                fillHex={fillHex}
                noFill={!!any.isNoFill}
                onColor={(hex) => recolor(hex)}
                onNoFill={setTextNoFill}
              />
            ) : (
              <ColorSwatch value={fillHex} onChange={(hex) => recolor(hex)} />
            )}
          </Field>
        </section>
      )}

      {/* arrange: flip / center / lock / one-step z-order */}
      {"xpos" in any && <ArrangeSection uid={any._uid} />}

      {/* effects */}
      {"xpos" in any && <EffectsSection any={any} patch={patch} />}

      {/* z-order + ops */}
      <OpsSection />
    </div>
  );
}
