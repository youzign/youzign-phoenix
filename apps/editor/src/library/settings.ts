// API keys for photo providers live in localStorage only (client-side BYOK).
import type { ProviderId } from "./photos.js";

const LS_KEY = "youzign-next:library-keys";

export function getKeys(): Partial<Record<ProviderId, string>> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getKey(provider: ProviderId): string {
  return getKeys()[provider] || "";
}

export function setKey(provider: ProviderId, key: string): void {
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
