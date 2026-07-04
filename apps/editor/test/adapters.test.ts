import { describe, it, expect } from "vitest";
import {
  mapIconifySearch,
  iconifySvgUrl,
  iconifyColorPreviewUrl,
  isColorIcon,
  STYLE_PREFIXES,
  DEFAULT_COLOR_ICONS,
  ICON_CATEGORIES,
} from "../src/library/iconify.js";
import {
  mapUnsplash,
  mapUnsplashList,
  PHOTO_CATEGORIES,
} from "../src/library/photos.js";
import {
  ASPECT_PRESETS,
  buildFalRequest,
  mapFalResponse,
  buildFalEditRequest,
  clampImages,
  MAX_EDIT_IMAGES,
  FAL_MODEL,
  FAL_EDIT_MODEL,
} from "../src/library/generate.js";
import {
  MAGIC_EDIT_MODEL,
  MAGIC_EXPAND_MODEL,
  MAGIC_UPSCALE_MODEL,
  buildMagicEditRequest,
  buildMagicExpandRequest,
  buildMagicUpscaleRequest,
  planExpand,
} from "../src/magic/endpoints.js";

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

  it("flags Color-set icons so they skip the recolor path", () => {
    expect(isColorIcon("flat-color-icons:like")).toBe(true);
    expect(isColorIcon("twemoji:star")).toBe(true);
    // monochrome / Line sets are recolorable
    expect(isColorIcon("mdi:home")).toBe(false);
    expect(isColorIcon("lucide:heart")).toBe(false);
  });

  it("keeps the icon's own colors in the Color preview (no color override)", () => {
    expect(iconifyColorPreviewUrl("flat-color-icons:like")).not.toContain("color=");
  });

  it("opens pre-populated: default color grid + categories, per style", () => {
    expect(DEFAULT_COLOR_ICONS.length).toBeGreaterThan(12);
    expect(DEFAULT_COLOR_ICONS.every((id) => isColorIcon(id))).toBe(true);
    expect(ICON_CATEGORIES.length).toBeGreaterThan(4);
    expect(STYLE_PREFIXES.color).toContain("flat-color-icons");
    expect(STYLE_PREFIXES.line.length).toBeGreaterThan(0);
  });
});

describe("unsplash adapter", () => {
  const raw = {
    id: "abc",
    width: 1200,
    height: 800,
    urls: { small: "s.jpg", regular: "r.jpg" },
    user: { name: "Linus", links: { html: "https://unsplash/linus" } },
    links: {
      html: "https://unsplash/abc",
      download_location: "https://api.unsplash.com/photos/abc/download",
    },
  };

  it("maps search results (`{ results }`) with nested user + urls + download loc", () => {
    const out = mapUnsplash({ results: [raw] });
    expect(out[0]).toMatchObject({
      id: "abc",
      thumb: "s.jpg",
      full: "r.jpg",
      author: "Linus",
      authorLink: "https://unsplash/linus",
      link: "https://unsplash/abc",
      downloadLocation: "https://api.unsplash.com/photos/abc/download",
    });
    expect(mapUnsplash({})).toEqual([]);
  });

  it("maps the featured feed (bare array) with the same shape", () => {
    const out = mapUnsplashList([raw]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "abc", full: "r.jpg" });
    // non-array input is tolerated
    expect(mapUnsplashList({})).toEqual([]);
    expect(mapUnsplashList(null)).toEqual([]);
  });

  it("ships a non-empty set of category chips (no empty search box)", () => {
    expect(PHOTO_CATEGORIES.length).toBeGreaterThan(3);
  });
});

describe("fal.ai generate adapter", () => {
  const square = ASPECT_PRESETS.find((p) => p.id === "square")!;
  const landscape = ASPECT_PRESETS.find((p) => p.id === "landscape")!;
  const portrait = ASPECT_PRESETS.find((p) => p.id === "portrait")!;

  it("targets nano-banana text-to-image with enum aspect presets", () => {
    expect(FAL_MODEL).toBe("google/nano-banana-2-lite");
    expect(square).toMatchObject({ label: "Square", aspect_ratio: "1:1" });
    expect(landscape).toMatchObject({ label: "Landscape", aspect_ratio: "16:9" });
    expect(portrait).toMatchObject({ label: "Portrait", aspect_ratio: "9:16" });
  });

  it("builds a request payload from prompt + preset", () => {
    expect(buildFalRequest("  a red fox  ", landscape)).toEqual({
      prompt: "a red fox",
      aspect_ratio: "16:9",
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

describe("fal.ai image-to-image (nano-banana edit) adapter", () => {
  it("targets the nano-banana 2 lite edit endpoint", () => {
    expect(FAL_EDIT_MODEL).toBe("google/nano-banana-2-lite/edit");
    expect(MAX_EDIT_IMAGES).toBe(10);
  });

  it("builds an edit payload: trimmed prompt + image_urls array", () => {
    expect(
      buildFalEditRequest("  put them on a beach  ", ["data:a", "https://b.png"])
    ).toEqual({
      prompt: "put them on a beach",
      image_urls: ["data:a", "https://b.png"],
      num_images: 1,
    });
  });

  it("clamps reference images to the 10-image ceiling", () => {
    const many = Array.from({ length: 14 }, (_, i) => `img-${i}`);
    expect(clampImages(many)).toHaveLength(10);
    expect(clampImages(many)[9]).toBe("img-9");
    // request builder applies the same clamp
    const req = buildFalEditRequest("x", many);
    expect(req.image_urls).toHaveLength(10);
    // under the ceiling passes through untouched
    expect(clampImages(["a", "b"])).toEqual(["a", "b"]);
    expect(clampImages([])).toEqual([]);
  });

  it("maps the edit response through the shared image mapper", () => {
    const out = mapFalResponse({
      images: [{ url: "https://fal/out/edit.png", width: 1024, height: 1024 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: "https://fal/out/edit.png", width: 1024 });
  });
});

describe("magic extras fal request builders", () => {
  it("targets the chosen fal models", () => {
    expect(MAGIC_EDIT_MODEL).toBe("fal-ai/flux-pro/v1/fill");
    expect(MAGIC_EXPAND_MODEL).toBe("fal-ai/bria/expand");
    expect(MAGIC_UPSCALE_MODEL).toBe("fal-ai/clarity-upscaler");
  });

  it("builds prompt inpaint payloads without mutating image inputs", () => {
    expect(buildMagicEditRequest("img", "mask", "  red apple  ")).toEqual({
      image_url: "img",
      mask_url: "mask",
      prompt: "red apple",
      num_images: 1,
      enable_safety_checker: true,
    });
  });

  it("plans expand canvases around the original image", () => {
    expect(planExpand(360, 260, "16:9", 4 / 3)).toEqual({
      canvasWidth: 720,
      canvasHeight: 405,
      originalX: 180,
      originalY: 73,
      originalWidth: 360,
      originalHeight: 260,
    });
    const free = planExpand(360, 260, "free", 800 / 600);
    expect(free.canvasWidth / free.canvasHeight).toBeCloseTo(800 / 600, 2);
    expect(free.originalX).toBeGreaterThan(0);
    expect(free.originalY).toBeGreaterThan(0);
  });

  it("builds bria expand placement payloads from a plan", () => {
    const plan = planExpand(100, 50, "1:1", 1);
    expect(buildMagicExpandRequest("img", plan)).toEqual({
      image_url: "img",
      canvas_size: [200, 200],
      original_image_size: [100, 50],
      original_image_location: [50, 75],
    });
  });

  it("builds clarity upscale payloads with a 2x enhancement target", () => {
    expect(buildMagicUpscaleRequest("img")).toMatchObject({
      image_url: "img",
      upscale_factor: 2,
      creativity: 0.2,
      resemblance: 0.75,
    });
  });
});
