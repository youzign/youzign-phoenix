import { useState } from "react";
import type { Item } from "@youzign/designstring";
import { isShape } from "@youzign/editor-core";
import { useEditor } from "../store.js";
import { Icon, type IconName } from "./ui.js";

type IdItem = Item & { _uid?: number };

function typeIcon(item: Item): IconName {
  if (item.type === "text" || item.type === "text-curved") return "type";
  if (item.type === "image") return "image";
  if (item.type === "group") return "layers";
  if (item.type === "clipart") return isShape(item) ? "shapes" : "star";
  return "shapes";
}

function label(item: Item): string {
  if (item.type === "text" || item.type === "text-curved") {
    const c = ((item as any).content ?? "").replace(/\s+/g, " ").trim();
    return c ? (c.length > 28 ? c.slice(0, 27) + "…" : c) : "Text";
  }
  if (item.type === "image") return "Image";
  if (item.type === "group") return "Group";
  if (item.type === "clipart") {
    const kind = (item as any).rawAttrs?.["shape_kind"];
    if (kind) return kind[0].toUpperCase() + kind.slice(1);
    return "Graphic";
  }
  return item.type;
}

export function LayersPanel() {
  const [open, setOpen] = useState(true);
  const design = useEditor((s) => s.design);
  const selectedUids = useEditor((s) => s.selectedUids);
  const lockedUids = useEditor((s) => s.lockedUids);
  const select = useEditor((s) => s.select);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const toggleLockUid = useEditor((s) => s.toggleLockUid);
  const reorderLayers = useEditor((s) => s.reorderLayers);

  const [dragUid, setDragUid] = useState<number | null>(null);
  const [overUid, setOverUid] = useState<number | null>(null);

  // Top-of-stack first (highest index first).
  const rows = (design.items as IdItem[])
    .filter((it) => it.type !== "filter" && it._uid !== undefined)
    .sort((a, b) => ((b as any).index ?? 0) - ((a as any).index ?? 0));

  const drop = (targetUid: number) => {
    if (dragUid === null || dragUid === targetUid) {
      setDragUid(null);
      setOverUid(null);
      return;
    }
    const order = rows.map((r) => r._uid!);
    const from = order.indexOf(dragUid);
    const to = order.indexOf(targetUid);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragUid);
    reorderLayers(order);
    setDragUid(null);
    setOverUid(null);
  };

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 transition-colors hover:text-neutral-200"
      >
        <Icon name="layers" size={14} />
        <span>Layers</span>
        <span className="ml-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-400">
          {rows.length}
        </span>
        <Icon
          name="chevron-down"
          size={15}
          className={`ml-auto text-neutral-500 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <ul className="max-h-[38vh] overflow-y-auto px-2 pb-2">
          {rows.length === 0 && (
            <li className="px-2 py-3 text-[12px] text-neutral-600">No layers yet</li>
          )}
          {rows.map((item) => {
            const uid = item._uid!;
            const selected = selectedUids.includes(uid);
            const locked = lockedUids.includes(uid);
            return (
              <li
                key={uid}
                draggable
                onDragStart={() => setDragUid(uid)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overUid !== uid) setOverUid(uid);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(uid);
                }}
                onDragEnd={() => {
                  setDragUid(null);
                  setOverUid(null);
                }}
                onClick={(e) => {
                  if (e.shiftKey || e.metaKey || e.ctrlKey) toggleSelect(uid);
                  else select(uid);
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                  selected
                    ? "bg-[var(--accent-soft)] text-white"
                    : "text-neutral-300 hover:bg-white/[0.05]"
                } ${overUid === uid && dragUid !== null && dragUid !== uid ? "ring-1 ring-inset ring-[var(--accent)]" : ""} ${
                  dragUid === uid ? "opacity-50" : ""
                }`}
              >
                <Icon name="grip" size={14} className="shrink-0 cursor-grab text-neutral-600 group-hover:text-neutral-400" />
                <Icon name={typeIcon(item)} size={15} className="shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate">{label(item)}</span>
                <button
                  title={locked ? "Unlock" : "Lock"}
                  aria-label={locked ? "Unlock layer" : "Lock layer"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLockUid(uid);
                  }}
                  className={`shrink-0 rounded p-1 transition-colors ${
                    locked
                      ? "text-[var(--accent)]"
                      : "text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-neutral-200"
                  }`}
                >
                  <Icon name={locked ? "lock" : "unlock"} size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
