import { describe, it, expect } from "vitest";
import {
  mapIconifySearch,
  iconifySvgUrl,
} from "../src/library/iconify.js";
import {
  mapPexels,
  mapPixabay,
  mapUnsplash,
} from "../src/library/photos.js";
import {
  ASPECT_PRESETS,
  buildFalRequest,
  mapFalResponse,
} from "../src/library/generate.js";

describe("iconify adapter", () => {
  it("maps a search response to an icon-id list", () => {
    expect(mapIconifySearch({ icons: ["mdi:home", "mdi:cog"] })).toEqual([
      "mdi:home",
      "mdi:cog",
    ]);
    expect(mapIconifySearch({})).toEqual([]);
    expect(mapIconifySearch(null)).toEqual([]);
  });

  it("resolves a recolorable .svg url from an icon id", () => {
    expect(iconifySvgUrl("mdi:home")).toBe(
      "https://api.iconify.design/mdi/home.svg"
    );
  });
});

describe("pexels adapter", () => {
  it("maps photos to the common PhotoResult shape", () => {
    const out = mapPexels({
      photos: [
        {
          id: 123,
          width: 1600,
          height: 900,
          url: "https://pexels/p/123",
          photographer: "Ada",
          photographer_url: "https://pexels/ada",
          src: { medium: "m.jpg", large2x: "l.jpg" },
        },
      ],
    });
    expect(out).toEqual([
      {
        id: "123",
        thumb: "m.jpg",
        full: "l.jpg",
        width: 1600,
        height: 900,
        author: "Ada",
        authorLink: "https://pexels/ada",
        link: "https://pexels/p/123",
      },
    ]);
    expect(mapPexels({})).toEqual([]);
  });
});

describe("pixabay adapter", () => {
  it("maps hits, using pageURL as author + item link", () => {
    const out = mapPixabay({
      hits: [
        {
          id: 5,
          imageWidth: 800,
          imageHeight: 600,
          webformatURL: "w.jpg",
          largeImageURL: "big.jpg",
          user: "Grace",
          pageURL: "https://pixabay/5",
        },
      ],
    });
    expect(out[0]).toMatchObject({
      id: "5",
      thumb: "w.jpg",
      full: "big.jpg",
      author: "Grace",
      link: "https://pixabay/5",
    });
    expect(mapPixabay({})).toEqual([]);
  });
});

describe("unsplash adapter", () => {
  it("maps results with nested user + urls", () => {
    const out = mapUnsplash({
      results: [
        {
          id: "abc",
          width: 1200,
          height: 800,
          urls: { small: "s.jpg", regular: "r.jpg" },
          user: { name: "Linus", links: { html: "https://unsplash/linus" } },
          links: { html: "https://unsplash/abc" },
        },
      ],
    });
    expect(out[0]).toMatchObject({
      id: "abc",
      thumb: "s.jpg",
      full: "r.jpg",
      author: "Linus",
      authorLink: "https://unsplash/linus",
      link: "https://unsplash/abc",
    });
    expect(mapUnsplash({})).toEqual([]);
  });
});

describe("fal.ai generate adapter", () => {
  const square = ASPECT_PRESETS.find((p) => p.id === "square")!;
  const landscape = ASPECT_PRESETS.find((p) => p.id === "landscape")!;
  const portrait = ASPECT_PRESETS.find((p) => p.id === "portrait")!;

  it("exposes square/landscape/portrait presets with flux-friendly dims", () => {
    expect(square).toMatchObject({ width: 1024, height: 1024 });
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    // all dims are multiples of 32 (flux requirement)
    for (const p of ASPECT_PRESETS) {
      expect(p.width % 32).toBe(0);
      expect(p.height % 32).toBe(0);
    }
  });

  it("builds a request payload from prompt + preset", () => {
    expect(buildFalRequest("  a red fox  ", landscape)).toEqual({
      prompt: "a red fox",
      image_size: { width: 1344, height: 768 },
      num_images: 1,
      enable_safety_checker: true,
    });
  });

  it("maps a fal response to GenResult[], falling back to requested dims", () => {
    const out = mapFalResponse(
      {
        seed: 42,
        images: [
          { url: "https://fal/out/a.png", width: 1024, height: 1024 },
          { url: "https://fal/out/b.png" }, // missing dims -> fallback
        ],
      },
      { width: 512, height: 768 }
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ url: "https://fal/out/a.png", width: 1024, height: 1024 });
    expect(out[1]).toMatchObject({ url: "https://fal/out/b.png", width: 512, height: 768 });
    // ids are stable + distinct
    expect(new Set(out.map((r) => r.id)).size).toBe(2);
  });

  it("drops entries with no url and tolerates junk", () => {
    expect(mapFalResponse({ images: [{ width: 100 }, null, {}] })).toEqual([]);
    expect(mapFalResponse({})).toEqual([]);
    expect(mapFalResponse(null)).toEqual([]);
  });
});
