import { useMemo, useState } from "react";
import { DesignCanvas } from "@youzign/renderer";
import { useEditor } from "../store.js";
import { Icon } from "./ui.js";

function thumbZoom(width: number, height: number): number {
  return Math.min(1, 96 / Math.max(width, height));
}

export function PageStrip() {
  const pages = useEditor((s) => s.pages);
  const activePage = useEditor((s) => s.activePage);
  const setActivePage = useEditor((s) => s.setActivePage);
  const addPage = useEditor((s) => s.addPage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const deletePage = useEditor((s) => s.deletePage);
  const reorderPage = useEditor((s) => s.reorderPage);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const thumbs = useMemo(
    () => pages.map((page) => ({ page, zoom: thumbZoom(page.design.canvasWidth, page.design.canvasHeight) })),
    [pages]
  );

  if (pages.length === 1) {
    return (
      <div className="flex h-12 shrink-0 items-center justify-center border-t border-white/[0.06] bg-[#202024] px-4">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 text-[13px] font-medium text-neutral-300 transition-colors duration-150 hover:border-indigo-400/70 hover:text-white"
          onClick={addPage}
          data-testid="page-add"
        >
          <Icon name="plus" size={15} /> Add page
        </button>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 overflow-x-auto border-t border-white/[0.06] bg-[#202024] px-4 py-3"
      data-testid="page-strip"
    >
      <div className="mx-auto flex w-max items-stretch gap-2">
        {thumbs.map(({ page, zoom }, i) => {
          const active = i === activePage;
          return (
            <button
              key={i}
              type="button"
              className={`group relative flex w-[132px] flex-col items-center gap-1.5 rounded-lg border p-2 text-left transition-all duration-150 ${
                active
                  ? "border-indigo-400 ring-2 ring-indigo-400/45"
                  : "border-white/10 hover:border-white/25"
              }`}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) reorderPage(dragFrom, i);
                setDragFrom(null);
              }}
              onClick={() => setActivePage(i)}
              data-testid={`page-thumb-${i}`}
            >
              <span className="absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {i + 1}
              </span>
              <span className="absolute right-2 top-2 z-10 hidden gap-1 group-hover:flex">
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/75 text-neutral-200 transition-colors hover:bg-indigo-500 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicatePage(i);
                  }}
                  data-testid={`page-duplicate-${i}`}
                >
                  <Icon name="copy" size={13} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/75 text-neutral-200 transition-colors hover:bg-red-500 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(i);
                  }}
                  data-testid={`page-delete-${i}`}
                >
                  <Icon name="trash" size={13} />
                </span>
              </span>
              <span className="flex h-[78px] w-full items-center justify-center overflow-hidden rounded bg-[#141417]">
                <DesignCanvas design={page.design} zoom={zoom} />
              </span>
            </button>
          );
        })}
        <button
          className="flex w-[112px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-[13px] font-medium text-neutral-300 transition-colors duration-150 hover:border-indigo-400/70 hover:text-white"
          onClick={addPage}
          data-testid="page-add"
        >
          <Icon name="plus" size={18} />
          Add page
        </button>
      </div>
    </div>
  );
}
