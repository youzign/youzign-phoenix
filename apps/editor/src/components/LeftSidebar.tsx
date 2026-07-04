import { useEffect, useRef, useState } from "react";
import {
  SHAPE_KINDS,
  shapeSvg,
  COMBOS,
  FONT_COMBOS,
  fontComboFamilies,
  GOOGLE_FONTS,
  type ShapeKind,
  type ComboId,
  type TextPreset,
  type ShapePreset,
  type FontComboLayer,
  type TextEffectId,
} from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { ensureGoogleFonts } from "../fonts.js";
import { ColorSwatch, FontPicker, Icon, type IconName } from "./ui.js";
import {
  searchIcons,
  iconifySvgUrl,
  iconifyPreviewUrl,
  iconifyColorPreviewUrl,
  isColorIcon,
  STYLE_PREFIXES,
  ICON_CATEGORIES,
  DEFAULT_COLOR_ICONS,
  type IconStyle,
} from "../library/iconify.js";
import {
  featuredPhotos,
  searchPhotos,
  pingDownload,
  PHOTO_CATEGORIES,
  type PhotoResult,
} from "../library/photos.js";
import { unsplashKey, getKey, setKey } from "../library/settings.js";
import {
  ingestFiles,
  allUploads,
  deleteUpload,
  onUploadsChanged,
  uploadsForBrand,
  type UploadRecord,
} from "../library/uploads.js";
import {
  collectDesignColors,
  createBrand,
  deleteBrand,
  getActiveBrandId,
  listBrands,
  onBrandsChanged,
  renameBrand,
  setActiveBrand,
  setBrandColors,
  setBrandFonts,
  type Brand,
} from "../library/brands.js";
import {
  ASPECT_PRESETS,
  FAL_KEY_URL,
  MAX_EDIT_IMAGES,
  generate,
  editImages,
  clampImages,
  type AspectPreset,
  type GenResult,
} from "../library/generate.js";
import { pickFiles } from "../native.js";

type Tab = "photos" | "icons" | "text" | "elements" | "generate" | "brand";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "photos", label: "Photos", icon: "image" },
  { id: "icons", label: "Icons", icon: "star" },
  { id: "text", label: "Text", icon: "type" },
  { id: "elements", label: "Elements", icon: "shapes" },
  { id: "generate", label: "Create", icon: "sparkles" },
  { id: "brand", label: "Brand", icon: "droplet" },
];

/* --------------------------- small shared hooks --------------------------- */

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* --------------------------------- shell --------------------------------- */

export function LeftSidebar() {
  const [tab, setTab] = useState<Tab>("elements");

  return (
    <div className="flex h-full">
      {/* icon rail */}
      <nav className="flex w-[68px] flex-col items-center gap-1 border-r border-white/[0.06] bg-[#1c1c1f] py-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setTab(t.id)}
              className={`flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150 ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
              }`}
            >
              <Icon name={t.icon} size={20} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* panel */}
      <div className="flex w-64 flex-col overflow-hidden border-r border-white/[0.06] bg-[#202024]">
        {tab === "text" && <TextPanel />}
        {tab === "elements" && <ElementsPanel />}
        {tab === "icons" && <IconsPanel />}
        {tab === "photos" && <PhotosPanel />}
        {tab === "generate" && <GeneratePanel />}
        {tab === "brand" && <BrandPanel />}
      </div>
    </div>
  );
}

/* ------------------------------ shared bits ------------------------------ */

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[13px] font-semibold text-neutral-100">{children}</h2>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </p>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="mb-3 flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-[13px] transition-colors duration-150 focus-within:bg-white/[0.08] focus-within:ring-1 focus-within:ring-[var(--accent)]/70">
      <Icon name="search" size={15} className="shrink-0 text-neutral-500" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-neutral-100 placeholder:text-neutral-500 outline-none"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="shrink-0 text-neutral-500 hover:text-neutral-200"
          title="Clear"
        >
          <Icon name="plus" size={14} className="rotate-45" />
        </button>
      )}
    </label>
  );
}

/** Horizontally-scrolling row of canned-search chips. */
function ChipRow({
  chips,
  active,
  onPick,
}: {
  chips: readonly string[];
  active?: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
            active?.toLowerCase() === c.toLowerCase()
              ? "bg-[var(--accent)] text-white"
              : "bg-white/[0.05] text-neutral-300 hover:bg-white/[0.09] hover:text-neutral-100"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function SkeletonGrid({ cols = 3, rows = 4 }: { cols?: number; rows?: number }) {
  return (
    <div className={`grid gap-2.5 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-xl bg-white/[0.05]"
          style={{ animationDelay: `${(i % cols) * 60}ms` }}
        />
      ))}
    </div>
  );
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-neutral-500">
      {children}
    </p>
  );
}

/* -------------------------------- Brand ---------------------------------- */

function BrandPanel() {
  const design = useEditor((s) => s.design);
  const [, setRev] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => onBrandsChanged(() => setRev((r) => r + 1)), []);

  const brands = listBrands();
  const activeId = getActiveBrandId() ?? brands[0]?.id ?? null;
  const activeBrand = brands.find((brand) => brand.id === activeId) ?? brands[0];

  const createFromDesign = () => {
    const brand = createBrand({ name: "My brand", colors: collectDesignColors(design) });
    setActiveBrand(brand.id);
  };
  const createEmpty = () => {
    const brand = createBrand({ name: "New brand" });
    setActiveBrand(brand.id);
  };
  const commitRename = () => {
    if (editingId) renameBrand(editingId, editingName);
    setEditingId(null);
  };

  if (brands.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PanelHeader>Brand</PanelHeader>
        <button
          onClick={createFromDesign}
          className="mb-3 flex w-full flex-col gap-2 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)]/70 p-3 text-left transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-neutral-100">
            <Icon name="droplet" size={15} className="text-[var(--accent)]" />
            Start from this design
          </span>
          <span className="text-[11px] leading-relaxed text-neutral-400">
            Create My brand using the colors already on this canvas.
          </span>
          <div className="flex gap-1.5 pt-1">
            {collectDesignColors(design).slice(0, 6).map((color) => (
              <span
                key={color}
                className="h-5 w-5 rounded-md ring-1 ring-inset ring-white/15"
                style={{ background: color }}
              />
            ))}
          </div>
        </button>
        <button
          onClick={createEmpty}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2.5 text-[12px] font-semibold text-neutral-200 transition-colors duration-150 hover:bg-white/[0.09] hover:text-neutral-100"
        >
          <Icon name="plus" size={14} />
          New brand
        </button>
      </div>
    );
  }

  if (!activeBrand) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <PanelHeader>Brand</PanelHeader>
        <button
          onClick={createEmpty}
          title="New brand"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.05] text-neutral-300 transition-colors duration-150 hover:bg-white/[0.09] hover:text-neutral-100"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <SectionLabel>Brands</SectionLabel>
      <div className="mb-4 flex flex-col gap-1.5">
        {brands.map((brand) => {
          const active = brand.id === activeBrand.id;
          const editing = editingId === brand.id;
          return (
            <div
              key={brand.id}
              className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors duration-150 ${
                active
                  ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]/45"
                  : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {editing ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-neutral-100 outline-none"
                />
              ) : (
                <button
                  onClick={() => setActiveBrand(brand.id)}
                  onDoubleClick={() => {
                    setEditingId(brand.id);
                    setEditingName(brand.name);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-neutral-100"
                >
                  {brand.name}
                </button>
              )}
              <button
                title="Rename brand"
                onClick={() => {
                  setEditingId(brand.id);
                  setEditingName(brand.name);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 opacity-0 transition-all duration-150 hover:bg-white/10 hover:text-neutral-100 group-hover:opacity-100"
              >
                <Icon name="type" size={12} />
              </button>
              <button
                title="Delete brand"
                onClick={() => {
                  if (window.confirm(`Delete ${brand.name}?`)) deleteBrand(brand.id);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 opacity-0 transition-all duration-150 hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <BrandPalette brand={activeBrand} />
      <BrandFonts brand={activeBrand} />
      <BrandAssets brand={activeBrand} />
    </div>
  );
}

function BrandPalette({ brand }: { brand: Brand }) {
  const colors = brand.colors;
  const replace = (next: string[]) => setBrandColors(brand.id, next);
  const addColor = () => {
    const fallback = ["#3b82f6", "#14b8a6", "#f97316", "#a855f7", "#111827"].find(
      (color) => !colors.includes(color)
    );
    replace([...colors, fallback ?? "#3b82f6"]);
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...colors];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    replace(next);
  };

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Palette</SectionLabel>
        <button
          onClick={addColor}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-neutral-300 transition-colors duration-150 hover:bg-white/[0.09] hover:text-neutral-100"
        >
          <Icon name="plus" size={13} />
          Add color
        </button>
      </div>
      {colors.length === 0 ? (
        <QuietLine>No brand colors yet.</QuietLine>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {colors.map((color, index) => (
            <div
              key={`${color}-${index}`}
              data-brand-swatch={color}
              className="flex items-center justify-center"
            >
              <ColorSwatch
                compact
                showBrandRow={false}
                value={color}
                onChange={(hex) => replace(colors.map((c, i) => (i === index ? hex : c)))}
                actions={
                  <>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded-md px-1.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-35"
                    >
                      ← Move
                    </button>
                    <button
                      type="button"
                      disabled={index === colors.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded-md px-1.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-35"
                    >
                      Move →
                    </button>
                    <button
                      type="button"
                      onClick={() => replace(colors.filter((_, i) => i !== index))}
                      className="rounded-md px-1.5 py-1 text-[11px] font-medium text-red-300 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </>
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandFonts({ brand }: { brand: Brand }) {
  const pick = (key: "heading" | "body", family: string) => {
    ensureGoogleFonts([family]);
    setBrandFonts(brand.id, { [key]: family });
  };
  return (
    <div className="mb-5">
      <SectionLabel>Fonts</SectionLabel>
      <div className="mt-2 flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-neutral-500">Heading</span>
          <FontPicker value={brand.fonts.heading ?? ""} onChange={(family) => pick("heading", family)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-neutral-500">Body</span>
          <FontPicker value={brand.fonts.body ?? ""} onChange={(family) => pick("body", family)} />
        </label>
      </div>
    </div>
  );
}

function BrandAssets({ brand }: { brand: Brand }) {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const addPhoto = useEditor((s) => s.addPhoto);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      uploadsForBrand(brand.id).then((r) => {
        if (alive) setRecords(r);
      });
    };
    refresh();
    const off = onUploadsChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [brand.id]);

  const onFiles = async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    setBusy(true);
    try {
      await ingestFiles(files, { brandId: brand.id });
    } finally {
      setBusy(false);
    }
  };
  const chooseFiles = async () => {
    const files = await pickFiles({ accept: IMAGE_ACCEPT, multiple: true });
    if (files.length) await onFiles(files);
  };
  const insert = (r: UploadRecord) =>
    addPhoto({ source: r.dataUri, width: r.width, height: r.height });

  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void onFiles(e.dataTransfer.files);
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Assets</SectionLabel>
        <button
          onClick={() => void chooseFiles()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:brightness-110"
        >
          {busy ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Icon name="plus" size={13} />
          )}
          Upload
        </button>
      </div>
      {records.length === 0 ? (
        <button
          onClick={() => void chooseFiles()}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-3 py-5 text-center transition-colors duration-150 hover:border-[var(--accent)]/50 hover:bg-white/[0.05]"
        >
          <Icon name="image" size={18} className="text-neutral-500" />
          <span className="text-[11px] leading-relaxed text-neutral-500">
            Drop brand images here or click to upload
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {records.map((r) => (
            <div
              key={r.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-[repeating-conic-gradient(#2a2a30_0%_25%,#232329_0%_50%)] bg-[length:14px_14px] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50"
            >
              <img
                src={r.dataUri}
                alt={r.name}
                loading="lazy"
                className="h-full w-full cursor-pointer object-contain"
                onClick={() => insert(r)}
                title="Click to add to canvas"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteUpload(r.id);
                }}
                title="Remove asset"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity duration-150 hover:bg-red-600 group-hover:opacity-100"
              >
                <Icon name="plus" size={12} className="rotate-45" />
              </button>
            </div>
          ))}
        </div>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[#202024]/92 backdrop-blur-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon name="image" size={22} />
          </div>
          <p className="text-[13px] font-semibold text-neutral-100">Drop to upload</p>
          <p className="text-[11px] text-neutral-500">PNG, JPG, WEBP or SVG</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Icons ---------------------------------- */

function IconsPanel() {
  const [style, setStyle] = useState<IconStyle>("color");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [icons, setIcons] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const addClipart = useEditor((s) => s.addClipart);

  useEffect(() => {
    const q = debounced.trim();

    // Empty query in Color style → the curated default grid (never empty).
    if (!q && style === "color") {
      setIcons(DEFAULT_COLOR_ICONS);
      setState("done");
      return;
    }

    const ctrl = new AbortController();
    setState("loading");
    // Line style with no query falls back to a pleasant canned default.
    const effective = q || "arrow";
    searchIcons(effective, 60, ctrl.signal, STYLE_PREFIXES[style])
      .then((res) => {
        setIcons(res);
        setState("done");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState("error");
      });
    return () => ctrl.abort();
  }, [debounced, style]);

  const insert = (id: string) => {
    const url = iconifySvgUrl(id);
    // Color icons must NOT be recolored (keeps their designed fills faithful).
    addClipart(url, { recolorable: !isColorIcon(id) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-neutral-100">Icons</h2>
        <div className="flex gap-0.5 rounded-md bg-white/[0.05] p-0.5">
          {(["color", "line"] as IconStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-[5px] px-2 py-0.5 text-[10px] font-medium capitalize transition-colors duration-150 ${
                style === s
                  ? "bg-[var(--accent)] text-white"
                  : "text-neutral-400 hover:text-neutral-100"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search icons…"
      />
      <ChipRow chips={ICON_CATEGORIES} active={query} onPick={setQuery} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && <SkeletonGrid cols={3} rows={5} />}
        {state === "error" && (
          <QuietLine>Couldn’t reach the icon library. Try again.</QuietLine>
        )}
        {state === "done" && icons.length === 0 && (
          <QuietLine>No {style} icons for “{debounced}”. Try another word.</QuietLine>
        )}
        {state === "done" && icons.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {icons.map((id) => (
              <button
                key={id}
                title={id}
                onClick={() => insert(id)}
                className="group flex aspect-square items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07]"
              >
                <img
                  src={
                    style === "color"
                      ? iconifyColorPreviewUrl(id)
                      : iconifyPreviewUrl(id)
                  }
                  alt={id}
                  loading="lazy"
                  className="h-full w-full object-contain opacity-90 transition-opacity group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
        {style === "color"
          ? "Colorful icons insert as-is. Line icons recolor in the right panel."
          : "Line icons drop on the canvas — recolor them in the right panel."}
      </p>
    </div>
  );
}

/* -------------------------------- Photos --------------------------------- */

function PhotosPanel() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 350);
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const addPhoto = useEditor((s) => s.addPhoto);

  // Reset to page 1 whenever the query changes.
  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    const key = unsplashKey();
    const q = debounced.trim();
    const ctrl = new AbortController();
    if (page === 1) setState("loading");
    else setLoadingMore(true);

    const fetcher = q
      ? searchPhotos(q, page, key, ctrl.signal)
      : featuredPhotos(page, key, ctrl.signal);

    fetcher
      .then((res) => {
        setResults((prev) => (page === 1 ? res : [...prev, ...res]));
        setState("done");
        setLoadingMore(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setState("error");
          setLoadingMore(false);
        }
      });
    return () => ctrl.abort();
  }, [debounced, page]);

  const insert = (r: PhotoResult) => {
    pingDownload(r.downloadLocation, unsplashKey());
    addPhoto({
      source: r.full,
      width: r.width,
      height: r.height,
      attribution: {
        author: r.author,
        authorLink: r.authorLink,
        link: r.link,
        provider: "Unsplash",
      },
    });
  };

  // ---- local uploads (drag-drop / file picker → IndexedDB) ----
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    setBusy(true);
    try {
      await ingestFiles(files);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col p-4"
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void onFiles(e.dataTransfer.files);
      }}
    >
      <PanelHeader>Photos</PanelHeader>

      <UploadsSection onFiles={onFiles} busy={busy} />

      <SectionLabel>Unsplash</SectionLabel>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Unsplash…"
      />
      <ChipRow chips={PHOTO_CATEGORIES} active={query} onPick={setQuery} />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[#202024]/92 backdrop-blur-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon name="image" size={22} />
          </div>
          <p className="text-[13px] font-semibold text-neutral-100">Drop to upload</p>
          <p className="text-[11px] text-neutral-500">PNG, JPG, WEBP or SVG</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && <SkeletonGrid cols={2} rows={4} />}
        {state === "error" && (
          <QuietLine>Couldn’t reach Unsplash. Check your connection.</QuietLine>
        )}
        {state === "done" && results.length === 0 && (
          <QuietLine>No photos for “{debounced}”.</QuietLine>
        )}
        {state === "done" && results.length > 0 && (
          <>
            {!debounced.trim() && (
              <SectionLabel>Featured</SectionLabel>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {results.map((r) => (
                <button
                  key={r.id}
                  title={`Photo by ${r.author}`}
                  onClick={() => insert(r)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50"
                >
                  <img
                    src={r.thumb}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[9px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                    {r.author}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loadingMore}
              className="mt-3 w-full rounded-md bg-white/[0.05] py-2 text-[12px] font-medium text-neutral-300 transition-colors duration-150 hover:bg-white/[0.09] hover:text-neutral-100 disabled:opacity-40"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
        Photos via Unsplash. Attribution is kept with each item.
      </p>
    </div>
  );
}

/** "My uploads": upload button + drop-aware thumbnail grid, backed by IndexedDB. */
function UploadsSection({
  onFiles,
  busy,
}: {
  onFiles: (files: FileList | File[]) => void | Promise<void>;
  busy: boolean;
}) {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const addPhoto = useEditor((s) => s.addPhoto);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      allUploads().then((r) => {
        if (alive) setRecords(r);
      });
    };
    refresh();
    const off = onUploadsChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const insert = (r: UploadRecord) =>
    addPhoto({ source: r.dataUri, width: r.width, height: r.height });
  const chooseFiles = async () => {
    const files = await pickFiles({ accept: IMAGE_ACCEPT, multiple: true });
    if (files.length) await onFiles(files);
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>My uploads</SectionLabel>
        <button
          onClick={() => void chooseFiles()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:brightness-110"
        >
          {busy ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Icon name="plus" size={13} />
          )}
          Upload
        </button>
      </div>

      {records.length === 0 ? (
        <button
          onClick={() => void chooseFiles()}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-3 py-5 text-center transition-colors duration-150 hover:border-[var(--accent)]/50 hover:bg-white/[0.05]"
        >
          <Icon name="image" size={18} className="text-neutral-500" />
          <span className="text-[11px] leading-relaxed text-neutral-500">
            Drop images here or click to upload your own
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {records.map((r) => (
            <div
              key={r.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-[repeating-conic-gradient(#2a2a30_0%_25%,#232329_0%_50%)] bg-[length:14px_14px] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50"
            >
              <img
                src={r.dataUri}
                alt={r.name}
                loading="lazy"
                className="h-full w-full cursor-pointer object-contain"
                onClick={() => insert(r)}
                title="Click to add to canvas"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteUpload(r.id);
                }}
                title="Remove upload"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity duration-150 hover:bg-red-600 group-hover:opacity-100"
              >
                <Icon name="plus" size={12} className="rotate-45" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Text ---------------------------------- */

/** Approximate a font-combination layer's on-canvas look inside a preview card
 * (CSS analogues of the legacy border/shadow effects — see text-effects.ts). */
function applyEffectPreview(
  s: React.CSSProperties,
  effect: TextEffectId | undefined,
  color: string
) {
  switch (effect) {
    case "outline":
      s.color = "transparent";
      (s as any).WebkitTextStroke = `1.5px ${color}`;
      break;
    case "neon":
      s.textShadow = `0 0 5px ${color}, 0 0 11px ${color}`;
      break;
    case "sticker":
      s.textShadow =
        "-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0 3px 5px rgba(0,0,0,0.35)";
      break;
    case "hard-shadow":
      s.textShadow = "3px 3px 0 rgba(0,0,0,1)";
      break;
    case "echo":
      s.textShadow = `3px 3px 0 ${color}66`;
      break;
    default:
      break;
  }
}

function comboLayerPreviewStyle(layer: FontComboLayer): React.CSSProperties {
  const color = layer.color ?? "#1c1c1e";
  const size = Math.round(Math.max(11, Math.min(26, (layer.size ?? 32) * 0.2)));
  const s: React.CSSProperties = {
    fontFamily: `"${layer.font}", sans-serif`,
    fontWeight: layer.bold ? 700 : 400,
    fontStyle: layer.italic ? "italic" : "normal",
    fontSize: size,
    lineHeight: 1.12,
    color,
    whiteSpace: "nowrap",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  applyEffectPreview(s, layer.effect, color);
  return s;
}

function TextPanel() {
  const addText = useEditor((s) => s.addText);
  const addFontCombo = useEditor((s) => s.addFontCombo);
  const [query, setQuery] = useState("");

  // Preload every combo family so preview cards render in their real typefaces.
  useEffect(() => {
    ensureGoogleFonts(fontComboFamilies());
  }, []);

  const q = query.trim().toLowerCase();
  const fontMatches = q
    ? GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <PanelHeader>Text</PanelHeader>

      {/* Primary action */}
      <button
        onClick={() => addText()}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-3 text-[13.5px] font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all duration-150 hover:brightness-110"
      >
        <Icon name="plus" size={16} /> Add a text box
      </button>

      {/* Font search → inserts a text box in the chosen family */}
      <SearchField value={query} onChange={setQuery} placeholder="Search fonts" />
      {fontMatches.length > 0 && (
        <div className="-mt-1 mb-4 flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-black/20 p-1">
          {fontMatches.map((f) => (
            <button
              key={f}
              onMouseEnter={() => ensureGoogleFonts([f])}
              onClick={() => {
                ensureGoogleFonts([f]);
                addText({ font: f, content: f });
                setQuery("");
              }}
              className="truncate rounded px-2 py-1.5 text-left text-[14px] text-neutral-200 transition-colors hover:bg-white/10"
              style={{ fontFamily: `"${f}", sans-serif` }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Default text styles */}
      <SectionLabel>Default text styles</SectionLabel>
      <div className="mb-5 flex flex-col gap-1.5">
        {TEXT_PRESETS.map((t) => (
          <button
            key={t.label}
            onClick={() => addText(t.preset)}
            className="group flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--accent)]/50 hover:bg-white/[0.07]"
          >
            <span
              className="truncate text-neutral-100"
              style={{ ...t.preview, fontFamily: "Inter, sans-serif" }}
            >
              {t.sample}
            </span>
            <span className="shrink-0 text-[10px] font-medium text-neutral-500 group-hover:text-neutral-300">
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Font combinations — one click inserts pre-styled text layers */}
      <SectionLabel>Font combinations</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5">
        {FONT_COMBOS.map((c) => (
          <button
            key={c.id}
            onClick={() => addFontCombo(c.id)}
            title={c.label}
            className="group relative flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-black/5 bg-gradient-to-br from-white to-neutral-100 p-2.5 text-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 hover:ring-[var(--accent)]/50"
          >
            {c.layers.map((l, i) => (
              <span key={i} style={comboLayerPreviewStyle(l)}>
                {l.content}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Elements -------------------------------- */

interface TextPresetDef {
  label: string;
  sample: string;
  preview: React.CSSProperties;
  preset: TextPreset;
}

const TEXT_PRESETS: TextPresetDef[] = [
  {
    label: "Headline",
    sample: "Add a headline",
    preview: { fontSize: 20, fontWeight: 700 },
    preset: { content: "Add a headline", size: 90, bold: true, width: 640 },
  },
  {
    label: "Subheadline",
    sample: "Add a subheading",
    preview: { fontSize: 15, fontWeight: 600 },
    preset: { content: "Add a subheading", size: 52, width: 560 },
  },
  {
    label: "Body",
    sample: "Add a paragraph of body text",
    preview: { fontSize: 12, fontWeight: 400 },
    preset: { content: "Add a paragraph of body text", size: 32, width: 520 },
  },
  {
    label: "Caption",
    sample: "Small caption label",
    preview: { fontSize: 10, fontWeight: 500, letterSpacing: "0.02em" },
    preset: { content: "Small caption label", size: 20, width: 360 },
  },
  {
    label: "Quote",
    sample: "“A memorable quote here.”",
    preview: { fontSize: 13, fontStyle: "italic" },
    preset: {
      content: "“A memorable quote here.”",
      size: 40,
      italic: true,
      width: 540,
    },
  },
];

interface StyledShapeDef {
  label: string;
  kind: ShapeKind;
  preset: ShapePreset;
}

const STYLED_SHAPES: StyledShapeDef[] = [
  { label: "Card", kind: "rect", preset: { width: 220, height: 150, fill: "#ffffff", shadow: true } },
  { label: "Circle", kind: "ellipse", preset: { width: 160, height: 160, fill: "#ffffff", border: true, borderSize: 6, borderColor: "#4f46e5" } },
  { label: "Divider", kind: "line", preset: { width: 260, height: 24, fill: "#4f46e5" } },
];

function ElementsPanel() {
  const addShape = useEditor((s) => s.addShape);
  const addCombo = useEditor((s) => s.addCombo);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <PanelHeader>Elements</PanelHeader>

      {/* Shape primitives */}
      <SectionLabel>Shapes</SectionLabel>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {SHAPE_KINDS.map((k) => (
          <ShapeButton key={k} kind={k} onAdd={() => addShape(k)} />
        ))}
      </div>

      {/* Styled shapes */}
      <SectionLabel>Styled</SectionLabel>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {STYLED_SHAPES.map((s) => (
          <button
            key={s.label}
            onClick={() => addShape(s.kind, s.preset)}
            title={s.label}
            className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07]"
          >
            <StyledShapeGlyph label={s.label} />
            <span className="text-[9px] font-medium text-neutral-500 group-hover:text-neutral-300">
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {/* Combos */}
      <SectionLabel>Combos</SectionLabel>
      <div className="flex flex-col gap-1.5">
        {COMBOS.map((c) => (
          <button
            key={c.id}
            onClick={() => addCombo(c.id as ComboId)}
            className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--accent)]/50 hover:bg-white/[0.07]"
          >
            <ComboGlyph id={c.id} />
            <span className="text-[12.5px] font-medium text-neutral-100">
              {c.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StyledShapeGlyph({ label }: { label: string }) {
  if (label === "Card")
    return (
      <div className="h-7 w-9 rounded-md bg-white/90 shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
    );
  if (label === "Circle")
    return (
      <div className="h-8 w-8 rounded-full border-[3px] border-[var(--accent)] bg-transparent" />
    );
  return <div className="h-1.5 w-9 rounded-full bg-[var(--accent)]" />;
}

function ComboGlyph({ id }: { id: string }) {
  const base =
    "flex h-9 w-12 shrink-0 items-center justify-center rounded-md";
  if (id === "ribbon-text")
    return (
      <div className={`${base} bg-[var(--accent)]`}>
        <span className="text-[8px] font-bold text-white">TEXT</span>
      </div>
    );
  if (id === "badge")
    return (
      <div className={`${base} bg-transparent`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[7px] font-bold text-white">
          NEW
        </span>
      </div>
    );
  if (id === "button")
    return (
      <div className={`${base} bg-[var(--accent)]`}>
        <span className="text-[7px] font-semibold text-white">Click</span>
      </div>
    );
  return (
    <div className={`${base} flex-col gap-0.5 bg-white/90 px-1`}>
      <span className="text-[6px] italic text-neutral-700">“quote”</span>
      <span className="text-[5px] text-neutral-500">— name</span>
    </div>
  );
}

function ShapeButton({ kind, onAdd }: { kind: ShapeKind; onAdd: () => void }) {
  const previewSvg = shapeSvg(kind, "currentColor").replace(
    'preserveAspectRatio="none"',
    'preserveAspectRatio="xMidYMid meet"'
  );

  return (
    <button
      onClick={onAdd}
      title={kind}
      className="group flex aspect-square items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07] hover:shadow-md"
    >
      <span
        className="flex h-full w-full items-center justify-center text-neutral-300 transition-colors group-hover:text-white [&>svg]:h-full [&>svg]:w-full [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: previewSvg }}
      />
    </button>
  );
}

/* ------------------------------- Create ---------------------------------- */

function GeneratePanel() {
  const [hasKey, setHasKey] = useState(() => !!getKey("fal"));

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <PanelHeader>Create with AI</PanelHeader>
      {hasKey ? (
        <FalGenerate onDisconnect={() => setHasKey(false)} />
      ) : (
        <>
          <FalConnect onSaved={() => setHasKey(true)} />
          <DezygnBridgeCard />
        </>
      )}
    </div>
  );
}

/** Calm connect state for the fal.ai BYOK path. */
function FalConnect({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  const save = () => {
    if (!value.trim()) return;
    setKey("fal", value.trim());
    onSaved();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon name="sparkles" size={20} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-neutral-200">Connect fal.ai</p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          Add a fal.ai API key to generate images with FLUX. Bring your own key —
          it stays in this browser only, and you pay fal directly.
        </p>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="fal.ai API key"
        className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--accent)]/70"
      />
      <div className="flex items-center justify-between">
        <a
          href={FAL_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-[var(--accent)] hover:underline"
        >
          Get a key
        </a>
        <button
          onClick={save}
          disabled={!value.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-30"
        >
          Save key
        </button>
      </div>
    </div>
  );
}

/** Dual-fuel bridge: the "use your Dezygn credits" path, stubbed for v1. */
function DezygnBridgeCard() {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-neutral-400">
          <Icon name="wand" size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-neutral-300">Connect Dezygn</p>
          <p className="text-[10px] text-neutral-500">Use your Dezygn credits</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">
          Soon
        </span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
        No key to manage — generate straight from your Dezygn balance. Coming soon.
      </p>
    </div>
  );
}

type GenMode = "generate" | "edit";

/** A reference image queued for an edit: id for keying, a url (https or base64
 *  data URI) sent to fal, and a thumbnail (same as url) + label. */
interface EditRef {
  id: string;
  url: string;
  label: string;
}

/** Connected state: a Generate / Edit mode toggle over a shared session-results
 *  grid. Generate = text-to-image (FLUX); Edit = image-to-image composition with
 *  up to ten reference images (nano-banana 2 lite edit). */
function FalGenerate({ onDisconnect }: { onDisconnect: () => void }) {
  const [mode, setMode] = useState<GenMode>("generate");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [results, setResults] = useState<GenResult[]>([]);
  const addPhoto = useEditor((s) => s.addPhoto);

  const onError = (e: any) => {
    setState("error");
    // A network/CORS failure surfaces as a TypeError with no status.
    setError(
      /fal 4|fal 5/.test(String(e?.message))
        ? `fal rejected the request (${String(e.message).replace("fal ", "")}). Check your key and inputs.`
        : "Couldn’t reach fal.ai from the browser (network or CORS). Try again."
    );
  };
  const onResults = (res: GenResult[]) => {
    setResults((prev) => [...res, ...prev]);
    setState("idle");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* mode toggle */}
      <div className="mb-3 flex gap-0.5 rounded-lg bg-white/[0.05] p-0.5">
        {(
          [
            { id: "generate", label: "Generate", icon: "sparkles" },
            { id: "edit", label: "Edit", icon: "wand" },
          ] as { id: GenMode; label: string; icon: IconName }[]
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              if (state === "error") setState("idle");
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors duration-150 ${
              mode === m.id
                ? "bg-[var(--accent)] text-white"
                : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            <Icon name={m.icon} size={13} /> {m.label}
          </button>
        ))}
      </div>

      {mode === "generate" ? (
        <GenerateControls
          busy={state === "loading"}
          onStart={() => {
            setState("loading");
            setError("");
          }}
          onResults={onResults}
          onError={onError}
        />
      ) : (
        <EditControls
          busy={state === "loading"}
          onStart={() => {
            setState("loading");
            setError("");
          }}
          onResults={onResults}
          onError={onError}
        />
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && results.length === 0 && (
          <SkeletonGrid cols={2} rows={2} />
        )}
        {state === "error" && <QuietLine>{error}</QuietLine>}
        {state !== "loading" && results.length === 0 && state !== "error" && (
          <QuietLine>
            {mode === "generate"
              ? "Your generations show up here. Click one to drop it on the canvas."
              : "Add reference images, describe the edit, and results land here."}
          </QuietLine>
        )}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {results.map((r) => (
              <button
                key={r.id}
                title="Add to canvas"
                onClick={() =>
                  addPhoto({
                    source: r.url,
                    width: r.width,
                    height: r.height,
                    attribution: {
                      author: "",
                      authorLink: "",
                      link: r.url,
                      provider: "fal.ai",
                    },
                  })
                }
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50"
              >
                <img
                  src={r.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => {
          setKey("fal", "");
          onDisconnect();
        }}
        className="mt-2 self-start text-[10px] text-neutral-600 hover:text-neutral-400"
      >
        Disconnect fal.ai
      </button>
    </div>
  );
}

interface ModeProps {
  busy: boolean;
  onStart: () => void;
  onResults: (res: GenResult[]) => void;
  onError: (e: unknown) => void;
}

/** Text-to-image controls (prompt + aspect presets + generate). */
function GenerateControls({ busy, onStart, onResults, onError }: ModeProps) {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<AspectPreset>(ASPECT_PRESETS[0]);

  const run = () => {
    const p = prompt.trim();
    if (!p || busy) return;
    onStart();
    generate(p, preset, getKey("fal")).then(onResults).catch(onError);
  };

  return (
    <>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
        }}
        placeholder="Describe an image… e.g. a minimal indigo gradient poster background"
        rows={3}
        className="resize-none rounded-lg bg-white/[0.05] px-2.5 py-2 text-[13px] leading-relaxed text-neutral-100 placeholder:text-neutral-500 outline-none focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--accent)]/70"
      />

      <div className="mt-2.5 flex gap-1">
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p)}
            className={`flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ${
              preset.id === p.id
                ? "bg-[var(--accent)] text-white"
                : "bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-neutral-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={run}
        disabled={!prompt.trim() || busy}
        className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-30"
      >
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Generating…
          </>
        ) : (
          <>
            <Icon name="sparkles" size={14} /> Generate
          </>
        )}
      </button>
    </>
  );
}

/** Image-to-image controls: a reference-image strip (upload / My uploads /
 *  selected canvas image) capped at ten, a prompt, and generate. */
function EditControls({ busy, onStart, onResults, onError }: ModeProps) {
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<EditRef[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Selected canvas image (offer a one-tap "use this" chip).
  const selected = useEditor((s) => s.selectedItem());
  const selImage =
    selected && (selected as any).type === "image"
      ? {
          source: (selected as any).source as string,
          uid: (selected as any)._uid as number,
        }
      : null;

  // Keep the My-uploads quick-pick in sync with IndexedDB.
  useEffect(() => {
    let alive = true;
    const refresh = () => allUploads().then((r) => alive && setUploads(r));
    refresh();
    const off = onUploadsChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const room = MAX_EDIT_IMAGES - refs.length;

  const addRefs = (incoming: EditRef[]) =>
    setRefs((prev) => clampImages([...prev, ...incoming]));
  const removeRef = (id: string) =>
    setRefs((prev) => prev.filter((r) => r.id !== id));

  const onFiles = async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    const recs = await ingestFiles(files); // persists to My uploads too
    addRefs(recs.map((r) => ({ id: r.id, url: r.dataUri, label: r.name })));
  };
  const chooseFiles = async () => {
    const files = await pickFiles({ accept: IMAGE_ACCEPT, multiple: true });
    if (files.length) await onFiles(files);
  };

  const run = () => {
    const p = prompt.trim();
    if (!p || refs.length === 0 || busy) return;
    onStart();
    editImages(p, refs.map((r) => r.url), getKey("fal"))
      .then(onResults)
      .catch(onError);
  };

  return (
    <>
      {/* reference-image strip */}
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Reference images</SectionLabel>
        <span className="text-[10px] font-medium text-neutral-500">
          {refs.length}/{MAX_EDIT_IMAGES}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {refs.map((r) => (
          <div
            key={r.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-white/[0.08] bg-[repeating-conic-gradient(#2a2a30_0%_25%,#232329_0%_50%)] bg-[length:12px_12px]"
            title={r.label}
          >
            <img src={r.url} alt={r.label} className="h-full w-full object-contain" />
            <button
              onClick={() => removeRef(r.id)}
              title="Remove"
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
            >
              <Icon name="plus" size={10} className="rotate-45" />
            </button>
          </div>
        ))}
        {room > 0 && (
          <button
            onClick={() => void chooseFiles()}
            title="Upload images"
            className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-white/[0.14] text-neutral-500 transition-colors hover:border-[var(--accent)]/50 hover:text-neutral-200"
          >
            <Icon name="plus" size={15} />
            <span className="text-[8px] font-medium">Add</span>
          </button>
        )}
      </div>

      {/* quick sources */}
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {selImage && room > 0 && (
          <button
            onClick={() =>
              addRefs([
                {
                  id: `sel_${selImage.uid}_${Date.now()}`,
                  url: selImage.source,
                  label: "Canvas selection",
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] transition-colors hover:brightness-110"
          >
            <Icon name="image" size={12} /> Use selected image
          </button>
        )}
        {uploads.length > 0 && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-neutral-100"
          >
            <Icon name="image" size={12} /> My uploads
          </button>
        )}
      </div>

      {showPicker && uploads.length > 0 && (
        <div className="mb-2.5 max-h-28 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
          <div className="grid grid-cols-5 gap-1.5">
            {uploads.map((u) => (
              <button
                key={u.id}
                disabled={room <= 0}
                onClick={() =>
                  addRefs([{ id: `up_${u.id}_${Date.now()}`, url: u.dataUri, label: u.name }])
                }
                title={u.name}
                className="aspect-square overflow-hidden rounded-md border border-white/[0.06] bg-black/20 transition-transform hover:scale-105 disabled:opacity-30"
              >
                <img src={u.dataUri} alt={u.name} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
        }}
        placeholder="Describe the edit or composition… e.g. combine into one scene on a beach"
        rows={3}
        className="resize-none rounded-lg bg-white/[0.05] px-2.5 py-2 text-[13px] leading-relaxed text-neutral-100 placeholder:text-neutral-500 outline-none focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--accent)]/70"
      />

      <button
        onClick={run}
        disabled={!prompt.trim() || refs.length === 0 || busy}
        className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-30"
      >
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Editing…
          </>
        ) : (
          <>
            <Icon name="wand" size={14} /> Generate edit
          </>
        )}
      </button>
    </>
  );
}
