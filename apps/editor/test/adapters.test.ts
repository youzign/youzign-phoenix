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
