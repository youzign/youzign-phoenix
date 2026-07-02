import { useEffect, useRef, useState } from "react";
import { SHAPE_KINDS, shapeSvg, type ShapeKind } from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { Icon, type IconName } from "./ui.js";
import {
  searchIcons,
  iconifySvgUrl,
  iconifyPreviewUrl,
} from "../library/iconify.js";
import {
  PHOTO_PROVIDERS,
  type PhotoProvider,
  type PhotoResult,
} from "../library/photos.js";
import { getKey, setKey } from "../library/settings.js";
import {
  ASPECT_PRESETS,
  FAL_KEY_URL,
  generate,
  type AspectPreset,
  type GenResult,
} from "../library/generate.js";

type Tab = "photos" | "icons" | "shapes" | "generate";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "photos", label: "Photos", icon: "image" },
  { id: "icons", label: "Icons", icon: "star" },
  { id: "shapes", label: "Shapes", icon: "shapes" },
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
  const [tab, setTab] = useState<Tab>("shapes");
  const addText = useEditor((s) => s.addText);

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
        {tab === "shapes" && <ShapesPanel onAddText={addText} />}
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
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [icons, setIcons] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const addClipart = useEditor((s) => s.addClipart);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setIcons([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    setState("loading");
    searchIcons(q, 60, ctrl.signal)
      .then((res) => {
        setIcons(res);
        setState("done");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState("error");
      });
    return () => ctrl.abort();
  }, [debounced]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <PanelHeader>Icons</PanelHeader>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search icons…"
        autoFocus
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && <SkeletonGrid cols={3} rows={5} />}
        {state === "error" && <QuietLine>Couldn’t reach the icon library. Try again.</QuietLine>}
        {state === "idle" && (
          <QuietLine>
            Search 200,000+ open-source icons from Iconify. Click one to drop it on
            the canvas — recolor it in the right panel.
          </QuietLine>
        )}
        {state === "done" && icons.length === 0 && (
          <QuietLine>No icons for “{debounced}”.</QuietLine>
        )}
        {state === "done" && icons.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {icons.map((id) => (
              <button
                key={id}
                title={id}
                onClick={() => addClipart(iconifySvgUrl(id))}
                className="group flex aspect-square items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07]"
              >
                <img
                  src={iconifyPreviewUrl(id)}
                  alt={id}
                  loading="lazy"
                  className="h-full w-full object-contain opacity-80 transition-opacity group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Photos --------------------------------- */

function PhotosPanel() {
  const [provider, setProvider] = useState<PhotoProvider>(PHOTO_PROVIDERS[0]);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 350);
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [hasKey, setHasKey] = useState(() => !!getKey(provider.id));
  const addPhoto = useEditor((s) => s.addPhoto);

  useEffect(() => {
    setHasKey(!!getKey(provider.id));
  }, [provider]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q || !hasKey) {
      setResults([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    setState("loading");
    provider
      .search(q, 1, getKey(provider.id), ctrl.signal)
      .then((res) => {
        setResults(res);
        setState("done");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState("error");
      });
    return () => ctrl.abort();
  }, [debounced, provider, hasKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-neutral-100">Photos</h2>
        <div className="flex gap-0.5 rounded-md bg-white/[0.05] p-0.5">
          {PHOTO_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p)}
              className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150 ${
                provider.id === p.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-neutral-400 hover:text-neutral-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!hasKey ? (
        <KeyPrompt provider={provider} onSaved={() => setHasKey(true)} />
      ) : (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={`Search ${provider.label}…`}
            autoFocus
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {state === "loading" && <SkeletonGrid cols={2} rows={4} />}
            {state === "error" && (
              <QuietLine>Couldn’t reach {provider.label}. Check your API key.</QuietLine>
            )}
            {state === "idle" && (
              <QuietLine>Search free stock photos from {provider.label}.</QuietLine>
            )}
            {state === "done" && results.length === 0 && (
              <QuietLine>No photos for “{debounced}”.</QuietLine>
            )}
            {state === "done" && results.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {results.map((r) => (
                  <button
                    key={r.id}
                    title={`Photo by ${r.author}`}
                    onClick={() =>
                      addPhoto({
                        source: r.full,
                        width: r.width,
                        height: r.height,
                        pixabay: provider.id === "pixabay",
                        attribution: {
                          author: r.author,
                          authorLink: r.authorLink,
                          link: r.link,
                          provider: provider.label,
                        },
                      })
                    }
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
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
            Photos via {provider.label}. Attribution is kept with each item.
          </p>
        </>
      )}
    </div>
  );
}

function KeyPrompt({
  provider,
  onSaved,
}: {
  provider: PhotoProvider;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const save = () => {
    if (!value.trim()) return;
    setKey(provider.id, value.trim());
    onSaved();
  };
  return (
    <div className="flex flex-col gap-3 pt-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-neutral-400">
        <Icon name="image" size={20} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-neutral-200">
          Connect {provider.label}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          Add a free {provider.label} API key to search stock photos. It stays in
          this browser only.
        </p>
      </div>
      <input
        ref={ref}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={`${provider.label} API key`}
        className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--accent)]/70"
      />
      <div className="flex items-center justify-between">
        <a
          href={provider.keyUrl}
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

/* -------------------------------- Shapes --------------------------------- */

function ShapesPanel({ onAddText }: { onAddText: () => void }) {
  const addShape = useEditor((s) => s.addShape);
  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-neutral-100">Shapes</h2>
        <button
          onClick={onAddText}
          className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[12px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.12] hover:text-white"
        >
          <Icon name="type" size={14} /> Text
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {SHAPE_KINDS.map((k) => (
          <ShapeButton key={k} kind={k} onAdd={() => addShape(k)} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
        Click a shape to drop it on the canvas, then recolor it in the right
        panel.
      </p>
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
        {state === "error" && (
          <QuietLine>{error}</QuietLine>
        )}
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
