import { useEffect, useState } from "react";
import inputXml from "./fixtures/mountains-input.xml?raw";
import outputXml from "./fixtures/mountains-output.xml?raw";
import clipartLocalXml from "./fixtures/clipart-local.xml?raw";
import cropCurveXml from "./fixtures/crop-curve.xml?raw";
import fidelityEffectsXml from "./fixtures/fidelity-effects.xml?raw";
import fidelityFilterXml from "./fixtures/fidelity-filter.xml?raw";
import { useEditor } from "./store.js";
import { TopBar } from "./components/TopBar.js";
import { LeftSidebar } from "./components/LeftSidebar.js";
import { CanvasStage } from "./components/CanvasStage.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { ensureGoogleFonts } from "./fonts.js";
import type { Item } from "@youzign/designstring";

function collectFonts(items: Item[], out: Set<string>): void {
  for (const it of items) {
    if ((it.type === "text" || it.type === "text-curved") && (it as any).font) {
      out.add((it as any).font);
    }
    if (it.type === "group") collectFonts(it.items, out);
  }
}

const FIXTURES: Record<string, string> = {
  "mountains-input.xml": inputXml,
  "mountains-output.xml": outputXml,
  "clipart-local.xml": clipartLocalXml,
  "crop-curve.xml": cropCurveXml,
  "fidelity-effects.xml": fidelityEffectsXml,
  "fidelity-filter.xml": fidelityFilterXml,
};

export function App() {
  const [fixture, setFixture] = useState("mountains-input.xml");
  const load = useEditor((s) => s.load);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const del = useEditor((s) => s.deleteSelected);
  const nudge = useEditor((s) => s.nudgeSelected);
  const escapeSelection = useEditor((s) => s.escapeSelection);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const editing = useEditor((s) => s.editingUid);
  const design = useEditor((s) => s.design);

  // Load webfonts for every family used in the current design (so the canvas
  // renders them live). ensureGoogleFonts dedupes, so this is cheap to re-run.
  useEffect(() => {
    const fonts = new Set<string>();
    collectFonts(design.items, fonts);
    ensureGoogleFonts([...fonts]);
  }, [design]);

  // Load the selected fixture.
  useEffect(() => {
    load(FIXTURES[fixture], fixture.replace(/\.xml$/i, ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture]);

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
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        del();
      } else if (e.key === "Escape") {
        e.preventDefault();
        escapeSelection();
      } else if (e.key.toLowerCase() === "g" && !mod) {
        e.preventDefault();
        toggleGrid();
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
  }, [undo, redo, del, nudge, escapeSelection, toggleGrid, editing]);

  return (
    <div className="flex h-full flex-col bg-[#17171a] text-neutral-200">
      <TopBar fixtures={FIXTURES} fixture={fixture} onFixture={setFixture} />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="min-w-0 flex-1">
          <CanvasStage />
        </main>
        <aside className="w-[272px] overflow-y-auto border-l border-white/[0.06] bg-[#202024]">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
