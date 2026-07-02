import { useEffect, useState } from "react";
import {
  SHAPE_KINDS,
  shapeSvg,
  COMBOS,
  type ShapeKind,
  type ComboId,
  type TextPreset,
  type ShapePreset,
} from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { Icon, type IconName } from "./ui.js";
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
  ASPECT_PRESETS,
  FAL_KEY_URL,
  generate,
  type AspectPreset,
  type GenResult,
} from "../library/generate.js";

type Tab = "photos" | "icons" | "elements" | "generate";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "photos", label: "Photos", icon: "image" },
  { id: "icons", label: "Icons", icon: "star" },
  { id: "elements", label: "Elements", icon: "shapes" },
  { id: "generate", label: "Create", icon: "sparkles" },
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
        {tab === "elements" && <ElementsPanel />}
        {tab === "icons" && <IconsPanel />}
        {tab === "photos" && <PhotosPanel />}
        {tab === "generate" && <GeneratePanel />}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <PanelHeader>Photos</PanelHeader>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Unsplash…"
      />
      <ChipRow chips={PHOTO_CATEGORIES} active={query} onPick={setQuery} />

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
  const addText = useEditor((s) => s.addText);
  const addShape = useEditor((s) => s.addShape);
  const addCombo = useEditor((s) => s.addCombo);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <PanelHeader>Elements</PanelHeader>

      {/* Text presets */}
      <SectionLabel>Text</SectionLabel>
      <div className="mb-4 flex flex-col gap-1.5">
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
  return (
    <button
      onClick={onAdd}
      title={kind}
      className="group flex aspect-square items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07] hover:shadow-md"
    >
      <span
        className="h-full w-full text-neutral-300 transition-colors group-hover:text-white [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: shapeSvg(kind, "currentColor") }}
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

/** Connected state: prompt, aspect presets, generate, session results grid. */
function FalGenerate({ onDisconnect }: { onDisconnect: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<AspectPreset>(ASPECT_PRESETS[0]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [results, setResults] = useState<GenResult[]>([]);
  const addPhoto = useEditor((s) => s.addPhoto);

  const run = () => {
    const p = prompt.trim();
    if (!p || state === "loading") return;
    setState("loading");
    setError("");
    generate(p, preset, getKey("fal"))
      .then((res) => {
        setResults((prev) => [...res, ...prev]);
        setState("idle");
      })
      .catch((e) => {
        setState("error");
        // A network/CORS failure surfaces as a TypeError with no status.
        setError(
          /fal 4|fal 5/.test(String(e?.message))
            ? `fal rejected the request (${String(e.message).replace("fal ", "")}). Check your key and prompt.`
            : "Couldn’t reach fal.ai from the browser (network or CORS). Try again."
        );
      });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        disabled={!prompt.trim() || state === "loading"}
        className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-30"
      >
        {state === "loading" ? (
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

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && results.length === 0 && (
          <SkeletonGrid cols={2} rows={2} />
        )}
        {state === "error" && <QuietLine>{error}</QuietLine>}
        {state !== "loading" && results.length === 0 && state !== "error" && (
          <QuietLine>
            Your generations show up here. Click one to drop it on the canvas.
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
                      provider: "fal.ai (FLUX)",
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
