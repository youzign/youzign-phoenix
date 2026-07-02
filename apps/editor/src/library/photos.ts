// Unsplash stock-photo adapter. Pure `map*` functions (raw API JSON ->
// PhotoResult[]) are unit-tested; the fetching helpers use the built-in access
// key (a localStorage override still wins, via unsplashKey()).

export interface PhotoResult {
  id: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  author: string;
  authorLink: string;
  link: string;
  /** Unsplash download-tracking endpoint — pinged on insert per API guidelines. */
  downloadLocation: string;
}

export type ProviderId = "unsplash";

export interface PhotoProvider {
  id: ProviderId;
  label: string;
  /** Where to get a free API key (for the optional override). */
  keyUrl: string;
  search(query: string, page: number, key: string, signal?: AbortSignal): Promise<PhotoResult[]>;
}

const API = "https://api.unsplash.com";

/** Map one raw Unsplash photo object to a PhotoResult. */
function mapPhoto(r: any): PhotoResult {
  return {
    id: String(r.id),
    thumb: r.urls?.small ?? r.urls?.thumb ?? "",
    full: r.urls?.regular ?? r.urls?.full ?? "",
    width: r.width ?? 0,
    height: r.height ?? 0,
    author: r.user?.name ?? "",
    authorLink: r.user?.links?.html ?? "",
    link: r.links?.html ?? "",
    downloadLocation: r.links?.download_location ?? "",
  };
}

/** Search response shape: `{ results: [...] }`. */
export function mapUnsplash(json: any): PhotoResult[] {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map(mapPhoto);
}

/** List/featured response shape: a bare `[...]` array. */
export function mapUnsplashList(json: any): PhotoResult[] {
  const list = Array.isArray(json) ? json : [];
  return list.map(mapPhoto);
}

async function get(url: string, key: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
    signal,
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  return res.json();
}

/** A canned-search per category chip, plus the raw query search. */
export async function searchPhotos(
  query: string,
  page: number,
  key: string,
  signal?: AbortSignal
): Promise<PhotoResult[]> {
  const url = `${API}/search/photos?query=${encodeURIComponent(
    query
  )}&per_page=24&page=${page}`;
  return mapUnsplash(await get(url, key, signal));
}

/** The default "Featured" feed shown before any search (popular photos). */
export async function featuredPhotos(
  page: number,
  key: string,
  signal?: AbortSignal
): Promise<PhotoResult[]> {
  const url = `${API}/photos?order_by=popular&per_page=24&page=${page}`;
  return mapUnsplashList(await get(url, key, signal));
}

/**
 * Fire the Unsplash download-tracking ping (fire-and-forget) on insert, as the
 * API guidelines require. No-op when the endpoint is missing.
 */
export function pingDownload(downloadLocation: string, key: string): void {
  if (!downloadLocation) return;
  try {
    void fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` } });
  } catch {
    /* ignore */
  }
}

/** Category chips → canned searches (the tab is never an empty search box). */
export const PHOTO_CATEGORIES = [
  "Business",
  "Nature",
  "People",
  "Food",
  "Technology",
  "Abstract",
  "Travel",
  "Textures",
] as const;

export const unsplash: PhotoProvider = {
  id: "unsplash",
  label: "Unsplash",
  keyUrl: "https://unsplash.com/developers",
  search: searchPhotos,
};
