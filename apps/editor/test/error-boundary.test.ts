import { describe, expect, it } from "vitest";
import { fatalDebugRecord, renderFatalScreen } from "../src/fatalScreen.js";

describe("fatal startup screen", () => {
  it("renders an actionable error message without the DOM", () => {
    const target = { innerHTML: "" };

    renderFatalScreen(target as HTMLElement, new TypeError("Renderer failed"));

    expect(target.innerHTML).toContain("Youzign couldn't start");
    expect(target.innerHTML).toContain("TypeError: Renderer failed");
    expect(target.innerHTML).toContain("youzign-debug.log");
  });

  it("escapes error text before injecting html", () => {
    const target = { innerHTML: "" };

    renderFatalScreen(target as HTMLElement, new Error("<script>alert(1)</script>"));

    expect(target.innerHTML).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(target.innerHTML).not.toContain("<script>alert(1)</script>");
  });

  it("formats fatal debug records", () => {
    expect(fatalDebugRecord("mount.fatal", new Error("boom"))).toMatchObject({
      type: "mount.fatal",
      error: { name: "Error", message: "boom" },
    });
  });
});
