import { useRef } from "react";
import { toPng } from "html-to-image";
import { serialize } from "@youzign/designstring";
import { useEditor } from "../store.js";

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

  const exportPng = async () => {
    const node = document.querySelector<HTMLElement>(".yz-canvas");
    if (!node) return;
    const dataUrl = await toPng(node, {
      width: design.canvasWidth,
      height: design.canvasHeight,
      pixelRatio: 1,
      style: { transform: "none" },
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name || "design"}.png`;
    a.click();
  };

  const importXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result), file.name.replace(/\.xml$/i, ""));
    reader.readAsText(file);
  };

  const btn =
    "rounded px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-white">Youzign</span>
        <span className="text-neutral-700">/</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-44 rounded bg-transparent px-1.5 py-1 text-sm text-neutral-200 outline-none hover:bg-neutral-900 focus:bg-neutral-900"
        />
      </div>

      <div className="ml-2 flex items-center gap-0.5">
        <button className={btn} onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          ↶
        </button>
        <button className={btn} onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          ↷
        </button>
      </div>

      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <button className={btn} onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}>
          −
        </button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => setZoom(Math.min(2, zoom + 0.1))}>
          +
        </button>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-neutral-500">
        Template
        <select
          className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
          value={fixture}
          onChange={(e) => onFixture(e.target.value)}
        >
          {Object.keys(fixtures).map((k) => (
            <option key={k} value={k}>
              {FIXTURE_LABELS[k] ?? k}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={importXml}
        />
        <button className={btn} onClick={() => fileRef.current?.click()}>
          Import XML
        </button>
        <button className={btn} onClick={exportXml}>
          Export XML
        </button>
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          onClick={exportPng}
        >
          Export PNG
        </button>
      </div>
    </header>
  );
}
