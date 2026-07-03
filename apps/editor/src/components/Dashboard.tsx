import { useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_MAX,
  CANVAS_MIN,
  CANVAS_PRESETS,
  PRESET_CATEGORIES,
  clampCanvasDim,
  type CanvasPreset,
  type PresetCategory,
} from "@youzign/editor-core";
import {
  allDocuments,
  DASHBOARD_PAGE_SIZE,
  deleteDocument,
  documentMetaLine,
  pageCount,
  pageDocuments,
  duplicateRecord,
  migrateLocalStorageAutosaves,
  onDocumentsChanged,
  putDocument,
  shapeDocumentRecord,
  sortDocuments,
  type DocumentSortOrder,
  type DocumentRecord,
} from "../library/documents.js";
import { fileToUploadRecord, isAcceptedFile } from "../library/uploads.js";
import { openExternal, pickFiles } from "../native.js";
import { blankDocument, imageDocument, startImageDims, START_IMAGE_MAX_DIM } from "../newDesign.js";
import { editorHash } from "../router.js";
import { APP_VERSION, fetchUpdateInfo, type VersionInfo } from "../version.js";
import { Icon, accentBtn, ghostBtn, segItem } from "./ui.js";

const QUICK_PRESETS = ["ig-post-square", "ig-story", "yt-thumbnail", "print-a4", "print-business-card"];
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

function checkerStyle() {
  return {
    backgroundColor: "#151518",
    backgroundImage:
      "linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.06) 75%)",
    backgroundSize: "18px 18px",
    backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
  };
}

function RatioThumb({ preset }: { preset: CanvasPreset }) {
  const r = preset.width / preset.height;
  const w = r >= 1 ? 56 : Math.max(24, 56 * r);
  const h = r >= 1 ? Math.max(24, 56 / r) : 56;
  return <span className="rounded-[4px] bg-white/20" style={{ width: w, height: h }} />;
}

function DesignCard({ rec, onRefresh }: { rec: DocumentRecord; onRefresh: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(rec.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(rec.name), [rec.name]);
  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const open = () => {
    window.location.hash = editorHash(rec.id);
  };

  const saveName = async () => {
    const next = name.trim() || rec.name;
    setRenaming(false);
    if (next !== rec.name) {
      await putDocument({ ...rec, name: next, updatedAt: Date.now() });
      onRefresh();
    }
  };

  const duplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await putDocument(duplicateRecord(rec));
    onRefresh();
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteDocument(rec.id);
    onRefresh();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="group overflow-hidden rounded-xl border border-white/[0.06] bg-[#202024] shadow-sm outline-none transition-colors duration-150 hover:border-white/15 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      data-testid="design-card"
    >
      <div className="relative aspect-[4/3]" style={checkerStyle()}>
        {rec.thumb ? (
          <img src={rec.thumb} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-neutral-500">
            {rec.width}×{rec.height}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button className={accentBtn} onClick={(e) => (e.stopPropagation(), open())} data-testid="open-design">
            Open
          </button>
          <button className={ghostBtn} onClick={duplicate} data-testid="duplicate-design">
            <Icon name="copy" size={15} /> Duplicate
          </button>
          <button
            className={`${ghostBtn} ${confirmDelete ? "text-red-200 hover:text-red-100" : "text-neutral-300"}`}
            onClick={remove}
            onBlur={() => setConfirmDelete(false)}
            data-testid="delete-design"
          >
            <Icon name="trash" size={15} /> {confirmDelete ? "Delete?" : "Delete"}
          </button>
        </div>
      </div>
      <div className="p-3">
        {renaming ? (
          <input
            ref={inputRef}
            value={name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              // Card behaves like a button — swallow keys so Enter doesn't
              // "click" it and open the design mid-rename.
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void saveName();
              }
              if (e.key === "Escape") {
                setName(rec.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded-md bg-white/[0.06] px-2 py-1 text-[13px] font-medium text-neutral-100 outline-none ring-1 ring-[var(--accent)]/60"
            data-testid="rename-input"
          />
        ) : (
          <div
            className="truncate text-[13px] font-medium text-neutral-100"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            title="Double-click to rename"
            data-testid="design-name"
          >
            {rec.name}
          </div>
        )}
        <div className="mt-1 truncate text-[11px] tabular-nums text-neutral-500">
          {documentMetaLine(rec)}
        </div>
      </div>
    </article>
  );
}

function NewDesignModal({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState<PresetCategory>("Social");
  const [query, setQuery] = useState("");
  const [customW, setCustomW] = useState("1200");
  const [customH, setCustomH] = useState("1002");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      CANVAS_PRESETS.filter((p) => {
        if (!q) return p.category === cat;
        const dims = `${p.width}x${p.height}`;
        return p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q) || dims.includes(q.replace(/\s|×/g, "x"));
      }),
    [cat, q]
  );

  const create = async (name: string, width: number, height: number) => {
    const doc = blankDocument(width, height);
    const rec = shapeDocumentRecord({ name, doc });
    await putDocument(rec);
    window.location.hash = editorHash(rec.id);
  };

  const createFromPreset = (p: CanvasPreset) => create(p.name, p.width, p.height);
  const createCustom = () => create("Custom design", clampCanvasDim(Number(customW)), clampCanvasDim(Number(customH)));

  const startFromFile = async (file: File | undefined) => {
    if (!file || !isAcceptedFile(file)) return;
    setBusy(true);
    try {
      const upload = await fileToUploadRecord(file, START_IMAGE_MAX_DIM);
      const dims = startImageDims(upload.width, upload.height);
      const doc = imageDocument(upload.dataUri, dims.width, dims.height);
      const rec = shapeDocumentRecord({ name: file.name.replace(/\.[^.]+$/, "") || "Image design", doc });
      await putDocument(rec);
      window.location.hash = editorHash(rec.id);
    } finally {
      setBusy(false);
    }
  };
  const chooseFile = async () => {
    const [file] = await pickFiles({ accept: IMAGE_ACCEPT });
    await startFromFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onMouseDown={onClose}>
      <div
        className="grid max-h-[86vh] w-full max-w-[920px] grid-cols-[1.2fr_.8fr] overflow-hidden rounded-xl border border-white/[0.08] bg-[#202024] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        data-testid="new-design-modal"
      >
        <section className="min-h-0 border-r border-white/[0.06] p-4">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5">
            <Icon name="search" size={15} className="text-neutral-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sizes..."
              className="w-full bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
              data-testid="preset-search"
            />
          </div>
          {!q && (
            <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-white/[0.05] p-0.5">
              {PRESET_CATEGORIES.map((c) => (
                <button key={c} className={segItem(cat === c)} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid max-h-[58vh] grid-cols-2 gap-2 overflow-y-auto pr-1" data-testid="preset-grid">
            {visible.map((p) => (
              <button
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-colors duration-150 hover:border-white/15 hover:bg-white/[0.06]"
                onClick={() => void createFromPreset(p)}
                data-preset-id={p.id}
              >
                <RatioThumb preset={p} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-neutral-100">{p.name}</span>
                  <span className="block text-[11px] tabular-nums text-neutral-500">{p.width}×{p.height}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="space-y-4 p-4">
          <div>
            <div className="text-[12px] font-medium text-neutral-300">Custom size</div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1.5">
                <span className="text-[11px] text-neutral-500">W</span>
                <input
                  type="number"
                  min={CANVAS_MIN}
                  max={CANVAS_MAX}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-right text-[13px] tabular-nums text-neutral-100 outline-none"
                  data-testid="custom-width"
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
                  data-testid="custom-height"
                />
              </label>
            </div>
            <button className={`${accentBtn} mt-2 w-full justify-center`} onClick={() => void createCustom()} data-testid="create-custom">
              Create custom
            </button>
          </div>
          <div>
            <div className="text-[12px] font-medium text-neutral-300">Start from an image</div>
            <button
              className={`mt-2 flex h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed text-[12px] transition-colors duration-150 ${
                dragging ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-white/15 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]"
              }`}
              onClick={() => void chooseFile()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void startFromFile(e.dataTransfer.files[0]);
              }}
              data-testid="image-dropzone"
            >
              <Icon name="image" size={24} />
              <span className="mt-2">{busy ? "Preparing image..." : "Drop or choose an image"}</span>
              <span className="mt-1 text-[11px] text-neutral-500">Longest side capped at {START_IMAGE_MAX_DIM}px</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [modal, setModal] = useState(false);
  const [sortOrder, setSortOrder] = useState<DocumentSortOrder>("newest");
  const [page, setPage] = useState(1);
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const refresh = async () => setDocs(await allDocuments());

  useEffect(() => {
    void migrateLocalStorageAutosaves().then(refresh);
    return onDocumentsChanged(() => void refresh());
  }, []);

  useEffect(() => {
    void fetchUpdateInfo().then(setUpdateInfo);
  }, []);

  const quick = QUICK_PRESETS.map((id) => CANVAS_PRESETS.find((p) => p.id === id)).filter(Boolean) as CanvasPreset[];
  const sortedDocs = useMemo(() => sortDocuments(docs, sortOrder), [docs, sortOrder]);
  const pages = pageCount(sortedDocs.length, DASHBOARD_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, pages));
  const visibleDocs = useMemo(
    () => pageDocuments(sortedDocs, currentPage, DASHBOARD_PAGE_SIZE),
    [sortedDocs, currentPage]
  );
  const docCountLabel = `${docs.length} ${docs.length === 1 ? "design" : "designs"}`;

  useEffect(() => {
    setPage(1);
  }, [sortOrder]);

  useEffect(() => {
    if (page > Math.max(1, pages)) setPage(Math.max(1, pages));
  }, [page, pages]);

  return (
    <div className="min-h-full bg-[#17171a] text-neutral-200">
      {/* Same paddings/logo size as the editor TopBar so the header reads as
          static when switching between dashboard and editor. */}
      <header className="sticky top-0 z-10 flex h-[49px] items-center justify-between border-b border-white/[0.06] bg-[#1c1c1f] px-3">
        <div className="relative flex items-center gap-2.5">
          <button
            type="button"
            className="relative flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            onClick={() => updateInfo && setUpdateOpen((v) => !v)}
            aria-label={updateInfo ? "Youzign update available" : "Youzign"}
            aria-expanded={updateInfo ? updateOpen : undefined}
          >
            <img src="/brand/youzign-logo.png" alt="Youzign" className="h-7 w-7" />
            {updateInfo && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[#1c1c1f]" />
            )}
          </button>
          <span className="text-[14px] font-semibold text-neutral-100">youzign</span>
          {updateInfo && updateOpen && (
            <div className="absolute left-0 top-9 z-30 w-72 rounded-lg border border-white/10 bg-[#242428] p-3 shadow-2xl">
              <div className="text-[13px] font-semibold text-neutral-100">What's new</div>
              <div className="mt-1 text-[12px] leading-5 text-neutral-400">
                Youzign {updateInfo.version} is available. You have {APP_VERSION}.
                {updateInfo.notes ? ` ${updateInfo.notes}` : ""}
              </div>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                onClick={() => void openExternal(updateInfo.url)}
              >
                <Icon name="download" size={14} /> Download update
              </button>
            </div>
          )}
        </div>
        <button className={accentBtn} onClick={() => setModal(true)} data-testid="new-design">
          <Icon name="plus" size={16} /> New design
        </button>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {docs.length > 0 ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[12px] font-medium tabular-nums text-neutral-400">{docCountLabel}</div>
              <label className="flex items-center gap-2 text-[12px] text-neutral-500">
                <span>Sort</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as DocumentSortOrder)}
                  className="rounded-lg border border-white/[0.06] bg-[#202024] px-2.5 py-1.5 text-[13px] font-medium text-neutral-200 outline-none transition-colors duration-150 hover:border-white/15 focus:border-[var(--accent)]"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="dashboard-grid">
              {visibleDocs.map((rec) => (
                <DesignCard key={rec.id} rec={rec} onRefresh={() => void refresh()} />
              ))}
            </div>
            {pages > 1 && (
              <nav className="mt-5 flex items-center justify-center gap-1" aria-label="Design pages">
                <button
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium text-neutral-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-35"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium tabular-nums transition-colors duration-150 ${
                      p === currentPage
                        ? "bg-[var(--accent)] text-white"
                        : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100"
                    }`}
                    onClick={() => setPage(p)}
                    aria-current={p === currentPage ? "page" : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium text-neutral-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-35"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={currentPage === pages}
                  aria-label="Next page"
                >
                  ›
                </button>
              </nav>
            )}
          </>
        ) : (
          <section>
            <div className="mb-3 text-[13px] font-medium text-neutral-300">Start a new design</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {quick.map((p) => (
                <button
                  key={p.id}
                  className="flex h-36 flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#202024] p-3 transition-colors duration-150 hover:border-white/15 hover:bg-white/[0.06]"
                  onClick={async () => {
                    const rec = shapeDocumentRecord({ name: p.name, doc: blankDocument(p.width, p.height) });
                    await putDocument(rec);
                    window.location.hash = editorHash(rec.id);
                  }}
                  data-preset-id={p.id}
                >
                  <RatioThumb preset={p} />
                  <span className="mt-3 text-center text-[13px] font-medium text-neutral-100">{p.name}</span>
                  <span className="mt-1 text-[11px] tabular-nums text-neutral-500">{p.width}×{p.height}</span>
                </button>
              ))}
              <button
                className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#202024] p-3 text-neutral-300 transition-colors duration-150 hover:border-white/25 hover:bg-white/[0.06]"
                onClick={() => setModal(true)}
              >
                <Icon name="plus" size={22} />
                <span className="mt-3 text-[13px] font-medium">Custom</span>
              </button>
            </div>
          </section>
        )}
      </main>
      {modal && <NewDesignModal onClose={() => setModal(false)} />}
    </div>
  );
}
