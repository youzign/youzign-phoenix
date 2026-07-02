// Stock-photo provider adapters behind a single interface. Each adapter exposes
// a pure `map*` function (raw API JSON -> PhotoResult[]) that is unit-tested,
// and a `search()` that performs the fetch. Keys are read from localStorage
// settings and passed in by the caller (never bundled).

export interface PhotoResult {
  id: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  author: string;
  authorLink: string;
  link: string;
}

export type ProviderId = "pexels" | "pixabay" | "unsplash";

export interface PhotoProvider {
  id: ProviderId;
  label: string;
  /** Where to get a free API key (shown in the calm no-key state). */
  keyUrl: string;
  search(query: string, page: number, key: string, signal?: AbortSignal): Promise<PhotoResult[]>;
}

/* --------------------------------- Pexels -------------------------------- */

export function mapPexels(json: any): PhotoResult[] {
  const photos = Array.isArray(json?.photos) ? json.photos : [];
  return photos.map((p: any) => ({
    id: String(p.id),
    thumb: p.src?.medium ?? p.src?.small ?? "",
    full: p.src?.large2x ?? p.src?.large ?? p.src?.original ?? "",
    width: p.width ?? 0,
    height: p.height ?? 0,
    author: p.photographer ?? "",
    authorLink: p.photographer_url ?? "",
    link: p.url ?? "",
  }));
}

export const pexels: PhotoProvider = {
  id: "pexels",
  label: "Pexels",
  keyUrl: "https://www.pexels.com/api/",
  async search(query, page, key, signal) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
      query
    )}&per_page=24&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: key }, signal });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    return mapPexels(await res.json());
  },
};

/* -------------------------------- Pixabay -------------------------------- */

export function mapPixabay(json: any): PhotoResult[] {
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  return hits.map((h: any) => ({
    id: String(h.id),
    thumb: h.webformatURL ?? h.previewURL ?? "",
    full: h.largeImageURL ?? h.webformatURL ?? "",
    width: h.imageWidth ?? h.webformatWidth ?? 0,
    height: h.imageHeight ?? h.webformatHeight ?? 0,
    author: h.user ?? "",
    authorLink: h.pageURL ?? "",
    link: h.pageURL ?? "",
  }));
}

export const pixabay: PhotoProvider = {
  id: "pixabay",
  label: "Pixabay",
  keyUrl: "https://pixabay.com/api/docs/",
  async search(query, page, key, signal) {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(
      key
    )}&q=${encodeURIComponent(query)}&image_type=photo&per_page=24&page=${page}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Pixabay ${res.status}`);
    return mapPixabay(await res.json());
  },
};

/* -------------------------------- Unsplash ------------------------------- */

export function mapUnsplash(json: any): PhotoResult[] {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map((r: any) => ({
    id: String(r.id),
    thumb: r.urls?.small ?? r.urls?.thumb ?? "",
    full: r.urls?.regular ?? r.urls?.full ?? "",
    width: r.width ?? 0,
    height: r.height ?? 0,
    author: r.user?.name ?? "",
    authorLink: r.user?.links?.html ?? "",
    link: r.links?.html ?? "",
  }));
}

export const unsplash: PhotoProvider = {
  id: "unsplash",
  label: "Unsplash",
  keyUrl: "https://unsplash.com/developers",
  async search(query, page, key, signal) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query
    )}&per_page=24&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      signal,
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    return mapUnsplash(await res.json());
  },
};

// Pexels first (spec).
export const PHOTO_PROVIDERS: PhotoProvider[] = [pexels, pixabay, unsplash];
