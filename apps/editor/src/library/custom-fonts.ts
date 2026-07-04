// User-added Google Font family names live in localStorage only. Validation is
// done in the FontPicker UI because Google Fonts availability requires fetch().

const LS_KEY = "youzign-next:custom-fonts";

const listeners = new Set<() => void>();

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function notify(): void {
  for (const fn of listeners) fn();
}

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function read(): string[] {
  if (!hasStorage()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((value): value is string => typeof value === "string").map(normalize).filter(Boolean))
    );
  } catch {
    return [];
  }
}

function write(fonts: string[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(fonts));
  } catch {
    /* ignore quota / SSR */
  }
}

export function listCustomFonts(): string[] {
  return read();
}

export function addCustomFont(name: string): void {
  const family = normalize(name);
  if (!family) return;
  const next = Array.from(new Set([...read(), family])).sort((a, b) => a.localeCompare(b));
  write(next);
  notify();
}

export function removeCustomFont(name: string): void {
  const family = normalize(name);
  const next = read().filter((font) => font !== family);
  write(next);
  notify();
}

export function onCustomFontsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
