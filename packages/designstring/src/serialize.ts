import type { Design, Item } from "./types.js";

// Serialization is driven from the raw attribute bag + order captured at parse
// time, guaranteeing round-trip fidelity for known and unknown attributes.

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrString(rawAttrs: Record<string, string>, order: string[]): string {
  // Include any attrs present in rawAttrs even if missing from order (appended).
  const seen = new Set(order);
  const keys = [...order, ...Object.keys(rawAttrs).filter((k) => !seen.has(k))];
  return keys
    .filter((k) => rawAttrs[k] !== undefined)
    .map((k) => ` ${k}="${escapeAttr(rawAttrs[k])}"`)
    .join("");
}

function isTextLike(item: Item): boolean {
  return item.type === "text" || item.type === "text-curved";
}

function serializeItem(item: Item, indent: string): string {
  const attrs = attrString(item.rawAttrs, item.attrOrder);

  if (item.type === "group") {
    if (item.items.length === 0) {
      return `${indent}<item${attrs}/>`;
    }
    const children = item.items
      .map((c) => serializeItem(c, indent + "  "))
      .join("\n");
    return `${indent}<item${attrs}>\n${children}\n${indent}</item>`;
  }

  if (isTextLike(item)) {
    const content = (item as any).content ?? "";
    return `${indent}<item${attrs}><![CDATA[${content}]]></item>`;
  }

  return `${indent}<item${attrs}/>`;
}

export function serialize(design: Design): string {
  const dataAttrs = attrString(design.rawAttrs, design.attrOrder);
  const body = design.items.map((it) => serializeItem(it, "  ")).join("\n");
  const inner = body ? `\n${body}\n` : "\n";
  return `<?xml version="1.0" encoding="utf-8"?>\n<data${dataAttrs}>${inner}</data>\n`;
}
