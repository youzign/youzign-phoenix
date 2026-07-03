import { serialize } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { Icon, IconButton, ghostBtn } from "./ui.js";
import { ExportMenu } from "./ExportMenu.js";
import { ResizeMenu } from "./ResizeMenu.js";
import { dashboardHash } from "../router.js";
import { pickFiles, saveBlob } from "../native.js";

export function TopBar() {
  const design = useEditor((s) => s.design);
  const pages = useEditor((s) => s.pages);
  const activePage = useEditor((s) => s.activePage);
  const name = useEditor((s) => s.designName);
  const setName = useEditor((s) => s.setName);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const showGrid = useEditor((s) => s.showGrid);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const load = useEditor((s) => s.load);

  const exportXml = async () => {
    const blob = new Blob([serialize(design)], { type: "application/xml" });
    await saveBlob(blob, `${name || "design"}.xml`);
  };

  const importXml = async () => {
    const [file] = await pickFiles({ accept: ".xml,application/xml,text/xml" });
    if (!file) return;
    load(await file.text(), file.name.replace(/\.xml$/i, ""));
  };

  return (
    <header className="flex h-[49px] items-center gap-3 border-b border-white/[0.06] bg-[#1c1c1f] px-3">
      {/* brand + doc name */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => (window.location.hash = dashboardHash())}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-150 hover:scale-105"
          aria-label="Back to dashboard"
        >
          <img src="/brand/youzign-logo.png" alt="Youzign" className="h-7 w-7" />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
          className="w-48 rounded-md bg-transparent px-2 py-1 text-[13px] font-medium text-neutral-100 outline-none transition-colors hover:bg-white/[0.06] focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--accent)]/60"
        />
      </div>

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* resize canvas */}
      <ResizeMenu />

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* undo / redo */}
      <div className="flex items-center gap-0.5">
        <IconButton icon="undo" label="Undo  ⌘Z" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label="Redo  ⇧⌘Z" onClick={redo} disabled={!canRedo} />
      </div>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <IconButton icon="grid" label="Grid  G" onClick={toggleGrid} active={showGrid} />

      {/* center: zoom segmented control */}
      <div className="ml-auto flex items-center gap-1 rounded-lg bg-white/[0.05] p-0.5">
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
          aria-label="Zoom out"
        >
          <Icon name="minus" size={16} />
        </button>
        <span className="w-11 text-center text-[12px] font-medium tabular-nums text-neutral-200">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => setZoom(Math.min(2, zoom + 0.1))}
          aria-label="Zoom in"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      {/* right: import/export */}
      <div className="ml-auto flex items-center gap-2">
        <button className={ghostBtn} onClick={() => void importXml()}>
          <Icon name="upload" size={16} /> Import
        </button>
        <button className={ghostBtn} onClick={() => void exportXml()}>
          <Icon name="download" size={16} /> XML
        </button>
        <ExportMenu
          designName={name}
          canvasWidth={design.canvasWidth}
          canvasHeight={design.canvasHeight}
          pages={pages.map((p) => ({ canvasWidth: p.design.canvasWidth, canvasHeight: p.design.canvasHeight }))}
          activePage={activePage}
        />
      </div>
    </header>
  );
}
