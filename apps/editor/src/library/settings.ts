// API keys for BYOK integrations live in localStorage only (client-side).
// Covers the stock-photo providers plus the fal.ai generate key — one store,
// keyed by a small string union so callers stay type-safe.
import type { ProviderId } from "./photos.js";

/** Every service we hold a client-side key for. */
export type KeyId = ProviderId | "fal";

const LS_KEY = "youzign-next:library-keys";

export function getKeys(): Partial<Record<KeyId, string>> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getKey(provider: KeyId): string {
  return getKeys()[provider] || "";
}

export function setKey(provider: KeyId, key: string): void {
  const keys = getKeys();
  const trimmed = key.trim();
  if (trimmed) keys[provider] = trimmed;
  else delete keys[provider];
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(keys));
  } catch {
    /* ignore quota / SSR */
  }
}
