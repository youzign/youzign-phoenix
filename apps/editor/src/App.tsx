import { useEffect, useState } from "react";
import { useEditor } from "./store.js";
import { TopBar } from "./components/TopBar.js";
import { LeftSidebar } from "./components/LeftSidebar.js";
import { CanvasStage } from "./components/CanvasStage.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { LayersPanel } from "./components/LayersPanel.js";
import { Dashboard } from "./components/Dashboard.js";
import { ensureGoogleFonts } from "./fonts.js";
import {
  editorDocumentFromRecord,
  getDocument,
  putDocument,
  shapeDocumentRecord,
} from "./library/documents.js";
import { dashboardHash, parseHashRoute, type AppRoute } from "./router.js";
import type { Item } from "@youzign/designstring";
import { DesignCanvas } from "@youzign/renderer";
import { captureDashboardThumb } from "./export/dashboardThumb.js";
import { ingestFiles } from "./library/uploads.js";
import { extractPastedImageFiles, isTextEditingContext } from "./paste.js";

function collectFonts(items: Item[], out: Set<string>): void {
  for (const it of items) {
    if ((it.type === "text" || it.type === "text-curved") && (it as any).font) {
      out.add((it as any).font);
    }
    if (it.type === "group") collectFonts(it.items, out);
  }
}

function currentRoute(): AppRoute {
  return parseHashRoute(typeof window === "undefined" ? "#/" : window.location.hash);
}

function EditorView() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const del = useEditor((s) => s.deleteSelected);
  const dup = useEditor((s) => s.duplicateSelected);
  const toggleTextStyle = useEditor((s) => s.toggleTextStyle);
  const nudge = useEditor((s) => s.nudgeSelected);
  const escapeSelection = useEditor((s) => s.escapeSelection);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const addPhoto = useEditor((s) => s.addPhoto);
  const nextPage = useEditor((s) => s.nextPage);
  const previousPage = useEditor((s) => s.previousPage);
  const editing = useEditor((s) => s.editingUid);
  const design = useEditor((s) => s.design);
  const pages = useEditor((s) => s.pages);
  const activePage = useEditor((s) => s.activePage);
  const documentId = useEditor((s) => s.documentId);
  const designName = useEditor((s) => s.designName);
  const lastThumbRef = useState({ at: 0 })[0];

  // Load webfonts for every family used in the current design (so the canvas
  // renders them live). ensureGoogleFonts dedupes, so this is cheap to re-run.
  useEffect(() => {
    const fonts = new Set<string>();
    collectFonts(design.items, fonts);
    ensureGoogleFonts([...fonts]);
  }, [design]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing =
        editing !== null ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (typing) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dup();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleTextStyle("bold");
      } else if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleTextStyle("italic");
      } else if (mod && e.key.toLowerCase() === "u") {
        e.preventDefault();
        toggleTextStyle("underline");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        del();
      } else if (e.key === "Escape") {
        e.preventDefault();
        escapeSelection();
      } else if (e.key.toLowerCase() === "g" && !mod) {
        e.preventDefault();
        toggleGrid();
      } else if (e.key === "PageDown") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "PageUp") {
        e.preventDefault();
        previousPage();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const map: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = map[e.key];
        if (d) nudge(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, del, dup, toggleTextStyle, nudge, escapeSelection, toggleGrid, nextPage, previousPage, editing]);

  // Cmd/Ctrl+V with an image on the clipboard imports it into the Photos tab
  // (My uploads), exactly like using the upload button there, and places it
  // on the canvas (fit + centred, like addPhoto from the library). Left alone
  // entirely while the user is editing text (an input/textarea/contenteditable
  // has focus, or a canvas text item is mid-edit) or when the clipboard
  // carries no image, so normal text paste is never intercepted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEditingContext({ target: e.target, editingUid: editing })) return;
      const files = extractPastedImageFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void (async () => {
        const recs = await ingestFiles(files);
        recs.forEach((r) =>
          addPhoto({ source: r.dataUri, width: r.width, height: r.height })
        );
      })();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [editing, addPhoto]);

  useEffect(() => {
    if (!documentId) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        const previous = await getDocument(documentId);
        const now = Date.now();
        const thumb =
          now - lastThumbRef.at > 5000
            ? await captureDashboardThumb(previous)
            : previous?.thumb;
        if (now - lastThumbRef.at > 5000) lastThumbRef.at = now;
        await putDocument(
          shapeDocumentRecord({
            id: documentId,
            name: designName,
            doc: { pages, activePage },
            previous,
            thumb,
            now,
          })
        );
      })();
    }, 800);
    return () => window.clearTimeout(handle);
  }, [documentId, designName, pages, activePage, lastThumbRef]);

  return (
    <div className="flex h-full flex-col bg-[#17171a] text-neutral-200">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="min-w-0 flex-1">
          <CanvasStage />
        </main>
        <aside className="flex w-[272px] flex-col overflow-y-auto border-l border-white/[0.06] bg-[#202024]">
          <LayersPanel />
          <PropertiesPanel />
        </aside>
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed left-[-20000px] top-0"
        data-testid="export-pages"
      >
        {pages.map((page, i) => (
          <div key={i} data-export-page={i}>
            <DesignCanvas design={page.design} zoom={1} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const loadDocument = useEditor((s) => s.loadDocument);

  useEffect(() => {
    if (!window.location.hash) window.location.hash = dashboardHash();
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (route.view !== "editor") return;
    let cancelled = false;
    setLoadingDoc(true);
    void (async () => {
      const rec = await getDocument(route.id);
      if (cancelled) return;
      if (!rec) {
        window.location.hash = dashboardHash();
        setLoadingDoc(false);
        return;
      }
      loadDocument(editorDocumentFromRecord(rec), rec.name, rec.id);
      setLoadingDoc(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [route, loadDocument]);

  if (route.view === "dashboard") return <Dashboard tab={route.tab} />;
  if (loadingDoc) return <div className="flex h-full items-center justify-center bg-[#17171a] text-[13px] text-neutral-400">Loading design...</div>;
  return <EditorView />;
}
