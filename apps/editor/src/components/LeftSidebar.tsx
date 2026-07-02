import { useState } from "react";
import { SHAPE_KINDS, shapeSvg, type ShapeKind } from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { Icon, type IconName } from "./ui.js";

type Tab = "search" | "icons" | "shapes" | "generate";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "search", label: "Search", icon: "search" },
  { id: "icons", label: "Icons", icon: "star" },
  { id: "shapes", label: "Shapes", icon: "shapes" },
  { id: "generate", label: "Create", icon: "sparkles" },
];

export function LeftSidebar() {
  const [tab, setTab] = useState<Tab>("shapes");
  const addShape = useEditor((s) => s.addShape);
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
      <div className="w-64 overflow-y-auto border-r border-white/[0.06] bg-[#202024] p-4">
        {tab === "shapes" ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-neutral-100">Shapes</h2>
              <button
                onClick={addText}
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
      className="group flex aspect-square items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:bg-white/[0.07] hover:shadow-md"
    >
      <span
        className="h-full w-full text-neutral-300 transition-colors group-hover:text-white [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: shapeSvg(kind, "currentColor") }}
      />
    </button>
  );
}

function ComingSoon({ tab, onAddText }: { tab: Tab; onAddText: () => void }) {
  const copy: Record<string, { title: string; body: string; icon: IconName }> = {
    search: { title: "Stock photos", body: "Search millions of stock photos — coming soon.", icon: "search" },
    icons: { title: "Icons & clipart", body: "Browse the icon & clipart library — coming soon.", icon: "star" },
    generate: { title: "Create with AI", body: "Generate art & copy with AI — coming soon.", icon: "sparkles" },
  };
  const c = copy[tab];
  return (
    <div className="flex flex-col items-center gap-3 pt-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-neutral-400">
        <Icon name={c.icon} size={22} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-neutral-200">{c.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{c.body}</p>
      </div>
      <button
        onClick={onAddText}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-white/[0.12] hover:text-white"
      >
        <Icon name="type" size={14} /> Add a text box
      </button>
    </div>
  );
}
