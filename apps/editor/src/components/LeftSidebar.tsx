import { useState } from "react";
import { SHAPE_KINDS, shapeSvg, type ShapeKind } from "@youzign/editor-core";
import { useEditor } from "../store.js";

type Tab = "search" | "icons" | "shapes" | "generate";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "search", label: "Search", icon: "🔍" },
  { id: "icons", label: "Icons", icon: "⭐" },
  { id: "shapes", label: "Shapes", icon: "⬛" },
  { id: "generate", label: "Generate", icon: "✨" },
];

export function LeftSidebar() {
  const [tab, setTab] = useState<Tab>("shapes");
  const addShape = useEditor((s) => s.addShape);
  const addText = useEditor((s) => s.addText);

  return (
    <div className="flex h-full">
      {/* icon rail */}
      <nav className="flex w-14 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-950 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTab(t.id)}
            className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] transition ${
              tab === t.id
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* panel */}
      <div className="w-60 overflow-y-auto border-r border-neutral-800 bg-neutral-900 p-3">
        {tab === "shapes" ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Shapes
              </h2>
              <button
                onClick={addText}
                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
              >
                + Text
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SHAPE_KINDS.map((k) => (
                <ShapeButton key={k} kind={k} onAdd={() => addShape(k)} />
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
              Click a shape to drop it on the canvas. Recolor it in the right
              panel.
            </p>
          </div>
        ) : (
          <ComingSoon tab={tab} onAddText={addText} />
        )}
      </div>
    </div>
  );
}

function ShapeButton({ kind, onAdd }: { kind: ShapeKind; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      title={kind}
      className="flex aspect-square items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 p-2 hover:border-blue-500 hover:bg-neutral-750"
      dangerouslySetInnerHTML={{ __html: shapeSvg(kind, "#c8ccd4") }}
    />
  );
}

function ComingSoon({ tab, onAddText }: { tab: string; onAddText: () => void }) {
  const copy: Record<string, string> = {
    search: "Search millions of stock photos — coming soon.",
    icons: "Browse the icon & clipart library — coming soon.",
    generate: "Generate art & copy with AI — coming soon.",
  };
  return (
    <div className="flex flex-col items-center gap-3 pt-8 text-center">
      <div className="text-3xl opacity-40">{tab === "generate" ? "✨" : "🚧"}</div>
      <p className="text-xs text-neutral-500">{copy[tab]}</p>
      <button
        onClick={onAddText}
        className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
      >
        + Add a text box
      </button>
    </div>
  );
}
