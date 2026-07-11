// Pure extraction/guard logic for the editor-level Cmd/Ctrl+V paste-to-Photos
// feature (see the `paste` listener in App.tsx's EditorView). Kept dependency
// free and side-effect free so it's unit-testable without a real DOM.

export interface PasteGuardContext {
  /** `event.target` from the native paste event. */
  target: EventTarget | null;
  /** The store's `editingUid` — non-null while a text item is in inline edit. */
  editingUid: number | null;
}

function isTypingElement(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const el = node as Partial<HTMLElement>;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return el.isContentEditable === true;
}

/**
 * True when a paste should be left completely alone (not hijacked into the
 * Photos import) because the user is editing text: an input/textarea/
 * contenteditable has focus (checked via both the event target and
 * `document.activeElement`, since a paste can fire with either as the
 * meaningful target depending on browser/focus state), or the editor store
 * says a canvas text item is mid-edit (`editingUid`).
 */
export function isTextEditingContext(ctx: PasteGuardContext): boolean {
  if (ctx.editingUid !== null) return true;
  if (isTypingElement(ctx.target)) return true;
  if (typeof document !== "undefined" && isTypingElement(document.activeElement)) return true;
  return false;
}

/** Minimal shape of `DataTransferItem` this module needs — easy to fake in tests. */
export interface PasteClipboardItemLike {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

/** Minimal shape of `DataTransfer` (i.e. `ClipboardEvent.clipboardData`). */
export interface PasteClipboardDataLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<PasteClipboardItemLike> | null;
}

/**
 * Pull every image file out of clipboard data, checking both `files` (some
 * browsers populate this directly for a pasted image) and `items` (the more
 * portable path, since a single `items` entry might be an image with no
 * corresponding `files` entry). De-duplicates so a browser that reports the
 * same image in both lists doesn't import it twice.
 */
export function extractPastedImageFiles(data: PasteClipboardDataLike | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<File>();
  // Browsers commonly expose the same pasted image through BOTH `files` and
  // `items`, as two distinct File instances — identity alone can't dedup them.
  const seenSignatures = new Set<string>();
  const add = (file: File | null | undefined) => {
    if (!file || seen.has(file)) return;
    if (!file.type.startsWith("image/")) return;
    const signature = `${file.name} ${file.size} ${file.type} ${file.lastModified}`;
    if (seenSignatures.has(signature)) return;
    seen.add(file);
    seenSignatures.add(signature);
    out.push(file);
  };

  if (data.files) {
    for (const file of Array.from(data.files)) add(file);
  }
  if (data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) add(item.getAsFile());
    }
  }
  return out;
}
