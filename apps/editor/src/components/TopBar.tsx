import { useRef } from "react";
import { serialize } from "@youzign/designstring";
import { useEditor } from "../store.js";
import { Icon, IconButton, ghostBtn } from "./ui.js";
import { ExportMenu } from "./ExportMenu.js";
import { ResizeMenu } from "./ResizeMenu.js";

const FIXTURE_LABELS: Record<string, string> = {
  "mountains-input.xml": "Mountains (input)",
  "mountains-output.xml": "Mountains (output)",
  "clipart-local.xml": "Clipart (local)",
};

export function TopBar({
  fixtures,
  fixture,
  onFixture,
}: {
  fixtures: Record<string, string>;
  fixture: string;
  onFixture: (name: string) => void;
}) {
  const design = useEditor((s) => s.design);
  const name = useEditor((s) => s.designName);
  const setName = useEditor((s) => s.setName);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const load = useEditor((s) => s.load);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportXml = () => {
    const blob = new Blob([serialize(design)], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name || "design"}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result), file.name.replace(/\.xml$/i, ""));
    reader.readAsText(file);
  };

  return (
    <header className="flex items-center gap-3 border-b border-white/[0.06] bg-[#1c1c1f] px-3 py-2">
      {/* brand + doc name */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[13px] font-bold text-white shadow-sm">
          Y
        </span>
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

      {/* right: template + import/export */}
      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <select
            className="appearance-none rounded-md bg-white/[0.05] py-1.5 pl-2.5 pr-7 text-[12px] font-medium text-neutral-200 outline-none transition-colors hover:bg-white/[0.09] focus:ring-1 focus:ring-[var(--accent)]/60"
            value={fixture}
            onChange={(e) => onFixture(e.target.value)}
          >
            {Object.keys(fixtures).map((k) => (
              <option key={k} value={k} className="bg-neutral-800">
                {FIXTURE_LABELS[k] ?? k}
              </option>
            ))}
          </select>
          <Icon
            name="chevron-down"
            size={14}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
          />
        </div>

        <div className="mx-0.5 h-5 w-px bg-white/10" />

        <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={importXml} />
        <button className={ghostBtn} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> Import
        </button>
        <button className={ghostBtn} onClick={exportXml}>
          <Icon name="download" size={16} /> XML
        </button>
        <ExportMenu
          designName={name}
          canvasWidth={design.canvasWidth}
          canvasHeight={design.canvasHeight}
        />
      </div>
    </header>
  );
}
