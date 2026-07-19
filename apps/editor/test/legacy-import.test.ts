import { describe, expect, it, vi } from "vitest";
import { inlineLegacyImages, rewriteLegacyAssetUrls } from "../src/library/legacyImport.js";

describe("legacy asset URL rewriting", () => {
  it("rewrites both legacy S3 host styles and leaves unrelated URLs alone", () => {
    const input = [
      '<image src="https://s3.amazonaws.com/userdata.youzign.com/users/7/photo one.png" />',
      "<image source='http://userdata.youzign.com.s3.amazonaws.com/designs/9/logo.png' />",
      '<image src="https://example.com/untouched.png" />',
    ].join("");

    const result = rewriteLegacyAssetUrls(input, {
      base_url: "https://download.example.com/file/archive/",
      token: "signed-token",
    });

    expect(result.xml).toContain(
      'src="https://download.example.com/file/archive/users/7/photo one.png?Authorization=signed-token"'
    );
    expect(result.xml).toContain(
      "source='https://download.example.com/file/archive/designs/9/logo.png?Authorization=signed-token'"
    );
    expect(result.xml).toContain('src="https://example.com/untouched.png"');
    expect(result.urls).toEqual([
      "https://download.example.com/file/archive/users/7/photo one.png?Authorization=signed-token",
      "https://download.example.com/file/archive/designs/9/logo.png?Authorization=signed-token",
    ]);
  });

  it("rewrites youzign.com wp-content assets to the B2 x/ layout", () => {
    const input = [
      "<item source='https://youzign.com/wp-content/uploads/2020/12/shape-aB3.svg' />",
      '<item source="http://www.youzign.com/wp-content/uploads/2021/03/photo.png" />',
      "<item source='https://youzign.com/other/path.png' />",
    ].join("");

    const result = rewriteLegacyAssetUrls(input, {
      base_url: "https://download.example.com/file/archive",
      token: "signed-token",
    });

    expect(result.xml).toContain(
      "source='https://download.example.com/file/archive/wp-content/uploads/x/2020/12/shape-aB3.svg?Authorization=signed-token'"
    );
    expect(result.xml).toContain(
      'source="https://download.example.com/file/archive/wp-content/uploads/x/2021/03/photo.png?Authorization=signed-token"'
    );
    expect(result.xml).toContain("source='https://youzign.com/other/path.png'");
    expect(result.urls).toHaveLength(2);
  });

  it("strips query strings so signatures stay valid", () => {
    const input =
      '<item source="https://youzign.com/wp-content/uploads/2025/07/shot.png?cacheblock=true" />' +
      '<item source="https://s3.amazonaws.com/userdata.youzign.com/u/1/img.png?v=2" />';

    const result = rewriteLegacyAssetUrls(input, {
      base_url: "https://download.example.com/file/archive",
      token: "signed-token",
    });

    expect(result.urls).toEqual([
      "https://download.example.com/file/archive/u/1/img.png?Authorization=signed-token",
      "https://download.example.com/file/archive/wp-content/uploads/x/2025/07/shot.png?Authorization=signed-token",
    ]);
    expect(result.xml).not.toContain("cacheblock");
  });

  it("deduplicates its returned signed URLs", () => {
    const legacy = "https://s3.amazonaws.com/userdata.youzign.com/shared/photo.png";
    const result = rewriteLegacyAssetUrls(`<data a="${legacy}" b="${legacy}"></data>`, {
      base_url: "https://download.example.com",
      token: "token",
    });

    expect(result.urls).toHaveLength(1);
  });
});

describe("legacy image inlining", () => {
  it("fetches each distinct signed URL once and replaces every occurrence", async () => {
    const first = "https://download.example.com/a.png?Authorization=token";
    const second = "https://download.example.com/b.jpg?Authorization=token";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      const jpeg = value.includes("b.jpg");
      return new Response(new Blob([jpeg ? "jpeg" : "png"], { type: jpeg ? "image/jpeg" : "image/png" }), {
        status: 200,
        headers: { "Content-Type": jpeg ? "image/jpeg" : "image/png; charset=binary" },
      });
    });
    const progress = vi.fn();

    const result = await inlineLegacyImages(`<data a="${first}" b="${first}" c="${second}"></data>`, {
      fetchImpl: fetchImpl as typeof fetch,
      onProgress: progress,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual([]);
    expect(result.xml.match(/data:image\/png;base64,cG5n/g)).toHaveLength(2);
    expect(result.xml).toContain("data:image/jpeg;base64,anBlZw==");
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2 });
  });

  it("keeps failed signed URLs in place and reports them as warnings", async () => {
    const good = "https://download.example.com/good.png?Authorization=token";
    const bad = "https://download.example.com/bad.png?Authorization=token";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === bad) return new Response("nope", { status: 503 });
      return new Response(new Blob(["ok"], { type: "image/webp" }), { status: 200 });
    });

    const result = await inlineLegacyImages(`<data good="${good}" bad="${bad}"></data>`, {
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.xml).toContain("data:image/webp;base64,b2s=");
    expect(result.xml).toContain(bad);
    expect(result.failed).toEqual([bad]);
  });
});
