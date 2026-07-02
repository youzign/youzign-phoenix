import { useEffect, useRef, useState } from "react";
import {
  textColorHex,
  shapeFillHex,
  isShape,
  GOOGLE_FONTS,
  fontPatch,
  type ItemPatch,
} from "@youzign/editor-core";
import { signedIntToHex, hexToSignedInt } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { ensureGoogleFonts } from "../fonts.js";

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

  // Selected family may be a legacy face not in the curated list — show it too.
  const families =
    value && !GOOGLE_FONTS.includes(value) ? [value, ...GOOGLE_FONTS] : GOOGLE_FONTS;
  const filtered = families.filter((f) =>
    f.toLowerCase().includes(query.trim().toLowerCase())
  );

  // Load faces for every visible option so each renders in its own font.
  useEffect(() => {
    if (open) ensureGoogleFonts(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // Close on outside click.
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
        className="flex w-full items-center justify-between rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700"
        style={{ fontFamily: `"${value}", sans-serif` }}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
      >
        <span className="truncate">{value || "Select font"}</span>
        <span className="ml-2 text-neutral-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded border border-neutral-700 bg-neutral-900 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts…"
            className="w-full rounded-t bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 outline-none"
          />
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.map((f) => (
              <li key={f}>
                <button
                  className={`flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-neutral-800 ${
                    f === value ? "text-blue-400" : "text-neutral-200"
                  }`}
                  style={{ fontFamily: `"${f}", sans-serif` }}
                  onClick={() => {
                    onChange(f);
                    setOpen(false);
                  }}
                >
                  {f}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-xs text-neutral-500">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </label>
  );
}

const numInput =
  "w-20 rounded bg-neutral-800 px-2 py-1 text-right text-neutral-100 outline-none focus:ring-1 focus:ring-blue-500";

function OpsSection() {
  const dup = useEditor((s) => s.duplicateSelected);
  const del = useEditor((s) => s.deleteSelected);
  const front = useEditor((s) => s.bringToFront);
  const back = useEditor((s) => s.sendToBack);
  return (
    <section className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
      <div className="flex gap-1">
        <button
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          onClick={front}
        >
          Bring to front
        </button>
        <button
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          onClick={back}
        >
          Send to back
        </button>
      </div>
      <div className="flex gap-1">
        <button
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          onClick={dup}
        >
          Duplicate
        </button>
        <button
          className="flex-1 rounded bg-red-900/60 px-2 py-1 text-xs text-red-200 hover:bg-red-800"
          onClick={del}
        >
          Delete
        </button>
      </div>
    </section>
  );
}

const toggleBtn = (on: boolean) =>
  `rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
    on ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
  }`;

const colorInput = "h-6 w-8 cursor-pointer rounded bg-neutral-800";
const smallNum =
  "w-14 rounded bg-neutral-800 px-2 py-1 text-right text-neutral-100 outline-none focus:ring-1 focus:ring-blue-500";

/** Shadow / Border / Blur — writes the exact legacy attributes via patch. */
function EffectsSection({
  any,
  patch,
}: {
  any: any;
  patch: (p: ItemPatch) => void;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-neutral-800 pt-3">
      {/* Shadow */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Shadow
          </span>
          <button
            className={toggleBtn(!!any.isShadow)}
            onClick={() => patch({ isShadow: !any.isShadow })}
          >
            {any.isShadow ? "On" : "Off"}
          </button>
        </div>
        {any.isShadow && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Color">
              <input
                type="color"
                className={colorInput}
                value={signedIntToHex(any.shadowColor ?? 0)}
                onChange={(e) => patch({ shadowColor: hexToSignedInt(e.target.value) })}
              />
            </Row>
            <Row label="Opacity">
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                className={smallNum}
                value={Number(any.shadowOpacity ?? 0)}
                onChange={(e) => patch({ shadowOpacity: Number(e.target.value) })}
              />
            </Row>
            <Row label="Distance">
              <input
                type="number"
                min={0}
                className={smallNum}
                value={Math.round(any.shadowDistance ?? 0)}
                onChange={(e) => patch({ shadowDistance: Number(e.target.value) })}
              />
            </Row>
            <Row label="Angle">
              <input
                type="number"
                className={smallNum}
                value={Math.round(any.shadowAngle ?? 0)}
                onChange={(e) => patch({ shadowAngle: Number(e.target.value) })}
              />
            </Row>
          </div>
        )}
      </div>

      {/* Border */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Border
          </span>
          <button
            className={toggleBtn(!!any.isBorder)}
            onClick={() => patch({ isBorder: !any.isBorder })}
          >
            {any.isBorder ? "On" : "Off"}
          </button>
        </div>
        {any.isBorder && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Color">
              <input
                type="color"
                className={colorInput}
                value={signedIntToHex(any.borderColor ?? 0)}
                onChange={(e) => patch({ borderColor: hexToSignedInt(e.target.value) })}
              />
            </Row>
            <Row label="Width">
              <input
                type="number"
                min={0}
                className={smallNum}
                value={Math.round(any.borderSize ?? 0)}
                onChange={(e) => patch({ borderSize: Number(e.target.value) })}
              />
            </Row>
          </div>
        )}
      </div>

      {/* Blur */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Blur
          </span>
          <button
            className={toggleBtn(!!any.isBlur)}
            onClick={() => patch({ isBlur: !any.isBlur })}
          >
            {any.isBlur ? "On" : "Off"}
          </button>
        </div>
        {any.isBlur && (
          <Row label="Amount">
            <input
              type="number"
              min={0}
              className={smallNum}
              value={Math.round(any.blurSize ?? 0)}
              onChange={(e) => patch({ blurSize: Number(e.target.value) })}
            />
          </Row>
        )}
      </div>
    </section>
  );
}

export function PropertiesPanel() {
  const item = useEditor((s) => s.selectedItem());
  const selectedCount = useEditor((s) => s.selectedUids.length);
  const patch = useEditor((s) => s.patchSelected);
  const recolor = useEditor((s) => s.recolorSelected);

  if (selectedCount === 0) {
    return (
      <div className="p-4 text-xs text-neutral-500">
        Nothing selected. Click an item on the canvas.
      </div>
    );
  }

  // Multi-select: minimal panel, ops only, never coordinate fields.
  if (selectedCount > 1 || !item) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {selectedCount} items selected
        </div>
        <OpsSection />
      </div>
    );
  }

  const any = item as any;
  const isTextItem = item.type === "text" || item.type === "text-curved";
  const showFill = isTextItem || isShape(item);
  const fillHex = isTextItem
    ? textColorHex(item as any)
    : isShape(item)
    ? shapeFillHex(item as any)
    : "#000000";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {item.type}
      </div>

      {/* geometry */}
      {"xpos" in any && (
        <section className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {!isTextItem && (
              <>
                <Row label="W">
                  <input
                    type="number"
                    className={numInput}
                    value={Math.round(any.width)}
                    onChange={(e) => patch({ width: Number(e.target.value) })}
                  />
                </Row>
                <Row label="H">
                  <input
                    type="number"
                    className={numInput}
                    value={Math.round(any.height)}
                    onChange={(e) => patch({ height: Number(e.target.value) })}
                  />
                </Row>
              </>
            )}
            <Row label="Angle">
              <input
                type="number"
                className={numInput}
                value={Math.round(any.rotation)}
                onChange={(e) => patch({ rotation: Number(e.target.value) })}
              />
            </Row>
            <Row label="Opacity">
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                className={numInput}
                value={Number(any.opacity)}
                onChange={(e) => patch({ opacity: Number(e.target.value) })}
              />
            </Row>
          </div>
        </section>
      )}

      {/* text properties */}
      {isTextItem && (
        <section className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
          <FontPicker
            value={any.font}
            onChange={(family) => {
              ensureGoogleFonts([family]);
              patch(fontPatch(family));
            }}
          />
          <Row label="Font size">
            <input
              type="number"
              className={numInput}
              value={Math.round(any.size)}
              onChange={(e) => patch({ size: Number(e.target.value) })}
            />
          </Row>
          <div className="flex gap-1">
            <button
              className={`flex-1 rounded px-2 py-1 text-xs font-bold ${
                any.bold ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300"
              }`}
              onClick={() => patch({ bold: !any.bold })}
            >
              B
            </button>
            <button
              className={`flex-1 rounded px-2 py-1 text-xs italic ${
                any.italic ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300"
              }`}
              onClick={() => patch({ italic: !any.italic })}
            >
              I
            </button>
            <button
              className={`flex-1 rounded px-2 py-1 text-xs underline ${
                any.underline ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300"
              }`}
              onClick={() => patch({ underline: !any.underline })}
            >
              U
            </button>
          </div>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                className={`flex-1 rounded px-2 py-1 text-xs ${
                  any.alignment === a
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-300"
                }`}
                onClick={() => patch({ alignment: a })}
              >
                {a[0].toUpperCase()}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* fill */}
      {showFill && (
        <section className="border-t border-neutral-800 pt-3">
          <Row label="Fill">
            <input
              type="color"
              value={fillHex}
              onChange={(e) => recolor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded bg-neutral-800"
            />
          </Row>
        </section>
      )}

      {/* effects: shadow / border / blur */}
      {"xpos" in any && <EffectsSection any={any} patch={patch} />}

      {/* z-order + ops */}
      <OpsSection />
    </div>
  );
}
