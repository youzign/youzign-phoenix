export interface VersionInfo {
  version: string;
  url: string;
  notes?: string;
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";
export const VERSION_URL = "https://youzign-landing.vercel.app/version.json";
export const RELEASES_URL = "https://github.com/youzign/youzign-phoenix/releases";

function parts(version: string): number[] {
  const clean = version.trim().replace(/^v/i, "").split(/[+-]/)[0];
  return clean.split(".").map((part) => {
    const value = Number(part);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  });
}

export function compareSemver(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current = APP_VERSION): boolean {
  return compareSemver(candidate, current) > 0;
}

export async function fetchUpdateInfo(current = APP_VERSION): Promise<VersionInfo | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<VersionInfo>;
    if (!json.version || !isNewerVersion(json.version, current)) return null;
    return {
      version: json.version,
      url: json.url || `${RELEASES_URL}/latest`,
      notes: json.notes,
    };
  } catch {
    return null;
  }
}
