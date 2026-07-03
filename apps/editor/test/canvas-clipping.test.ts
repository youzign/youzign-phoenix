import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canvas clipping", () => {
  it("clips rendered canvas items while leaving the interaction overlay separate", () => {
    const canvasStage = readFileSync(resolve(__dirname, "../src/components/CanvasStage.tsx"), "utf8");

    expect(canvasStage).toContain('className="absolute inset-0 overflow-hidden"');
    expect(canvasStage).toContain('className="absolute inset-0"');
  });
});
