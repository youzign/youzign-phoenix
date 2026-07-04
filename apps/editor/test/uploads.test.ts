import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allUploads,
  isAcceptedFile,
  downscaleDims,
  canvasMime,
  ingestFiles,
  promisifyRequest,
  setUploadBrand,
  uploadsForBrand,
  MAX_UPLOAD_DIM,
  ACCEPTED_EXT,
} from "../src/library/uploads.js";

function requestWith<T>(result: T): IDBRequest<T> {
  const req = { result, error: undefined, onsuccess: null, onerror: null } as unknown as IDBRequest<T>;
  queueMicrotask(() => req.onsuccess?.call(req, {} as Event));
  return req;
}

function installIndexedDb() {
  const records = new Map<string, any>();
  let hasStore = false;
  const store = {
    put: (record: any) => {
      records.set(record.id, { ...record });
      return requestWith(record.id);
    },
    get: (id: string) => requestWith(records.get(id) ? { ...records.get(id) } : undefined),
    getAll: () => requestWith([...records.values()].map((record) => ({ ...record }))),
    delete: (id: string) => {
      records.delete(id);
      return requestWith(undefined);
    },
  };
  const db = {
    objectStoreNames: { contains: () => hasStore },
    createObjectStore: () => {
      hasStore = true;
      return store;
    },
    transaction: () => ({ objectStore: () => store }),
    close: () => {},
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: any = { result: db, error: undefined, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (!hasStore) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  });
  return records;
}

class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,${file.name}`;
    queueMicrotask(() => this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>));
  }
}

class FakeImage {
  naturalWidth = 640;
  naturalHeight = 480;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  installIndexedDb();
  vi.stubGlobal("FileReader", FakeFileReader);
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("upload file-type validation", () => {
  it("accepts png/jpg/webp/svg by mime type", () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]) {
      expect(isAcceptedFile({ type, name: "x" })).toBe(true);
    }
  });

  it("rejects non-image mime types", () => {
    expect(isAcceptedFile({ type: "application/pdf", name: "a.pdf" })).toBe(false);
    expect(isAcceptedFile({ type: "image/gif", name: "a.gif" })).toBe(false);
    expect(isAcceptedFile({ type: "text/plain", name: "a.png" })).toBe(false);
  });

  it("falls back to extension when the OS gives no mime type", () => {
    for (const ext of ACCEPTED_EXT) {
      expect(isAcceptedFile({ type: "", name: `photo.${ext}` })).toBe(true);
      expect(isAcceptedFile({ type: "", name: `PHOTO.${ext.toUpperCase()}` })).toBe(true);
    }
    expect(isAcceptedFile({ type: "", name: "notes.txt" })).toBe(false);
    expect(isAcceptedFile({ type: "", name: "noext" })).toBe(false);
  });
});

describe("downscale math", () => {
  it("leaves small images untouched", () => {
    expect(downscaleDims(800, 600)).toEqual({
      width: 800,
      height: 600,
      scale: 1,
      scaled: false,
    });
    // exactly at the cap → no scaling
    expect(downscaleDims(MAX_UPLOAD_DIM, 100).scaled).toBe(false);
  });

  it("caps the longest side while preserving aspect ratio", () => {
    const r = downscaleDims(4800, 2400);
    expect(r.scaled).toBe(true);
    expect(Math.max(r.width, r.height)).toBe(MAX_UPLOAD_DIM);
    expect(r.width / r.height).toBeCloseTo(2, 5);
  });

  it("caps a tall image on its height", () => {
    const r = downscaleDims(1200, 6000);
    expect(r.height).toBe(MAX_UPLOAD_DIM);
    expect(r.width).toBe(Math.round(1200 * (MAX_UPLOAD_DIM / 6000)));
  });

  it("handles zero dimensions without dividing by zero", () => {
    expect(downscaleDims(0, 0).scaled).toBe(false);
  });

  it("respects a custom cap", () => {
    const r = downscaleDims(2000, 1000, 1000);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(500);
  });
});

describe("canvas export mime (alpha handling)", () => {
  it("keeps png/webp/svg on png to preserve alpha, jpeg stays jpeg", () => {
    expect(canvasMime("image/png")).toBe("image/png");
    expect(canvasMime("image/webp")).toBe("image/png");
    expect(canvasMime("image/svg+xml")).toBe("image/png");
    expect(canvasMime("image/jpeg")).toBe("image/jpeg");
  });
});

describe("IndexedDB request wrapper", () => {
  it("resolves with the request result on success", async () => {
    const req: any = { result: 42, onsuccess: null, onerror: null };
    const p = promisifyRequest<number>(req);
    req.onsuccess();
    await expect(p).resolves.toBe(42);
  });

  it("rejects with the request error on failure", async () => {
    const err = new Error("boom");
    const req: any = { result: undefined, error: err, onsuccess: null, onerror: null };
    const p = promisifyRequest(req);
    req.onerror();
    await expect(p).rejects.toBe(err);
  });
});

describe("upload brand tagging", () => {
  it("stamps brandId when ingesting files with opts", async () => {
    const file = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });

    const [rec] = await ingestFiles([file], { brandId: "br_1" });

    expect(rec.brandId).toBe("br_1");
    expect(await uploadsForBrand("br_1")).toMatchObject([{ id: rec.id, brandId: "br_1" }]);
  });

  it("adds and removes an upload brand tag", async () => {
    const file = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });
    const [rec] = await ingestFiles([file]);

    await setUploadBrand(rec.id, "br_1");
    expect((await allUploads())[0]).toMatchObject({ id: rec.id, brandId: "br_1" });

    await setUploadBrand(rec.id, undefined);
    expect((await allUploads())[0].brandId).toBeUndefined();
  });

  it("filters uploads for a brand newest first", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 1000;
      return now;
    });
    const a = new File(["<svg />"], "a.svg", { type: "image/svg+xml" });
    const b = new File(["<svg />"], "b.svg", { type: "image/svg+xml" });
    const c = new File(["<svg />"], "c.svg", { type: "image/svg+xml" });

    const [first] = await ingestFiles([a], { brandId: "br_1" });
    const [other] = await ingestFiles([b], { brandId: "br_2" });
    const [second] = await ingestFiles([c], { brandId: "br_1" });

    const uploads = await uploadsForBrand("br_1");
    expect(uploads.map((upload) => upload.id)).toEqual([second.id, first.id]);
    expect(uploads.map((upload) => upload.id)).not.toContain(other.id);
  });
});
