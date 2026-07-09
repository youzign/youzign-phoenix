import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canvas clipping", () => {
  it("clips rendered canvas items while leaving the interaction overlay separate", () => {
    const canvasStage = readFileSync(resolve(__dirname, "../src/components/CanvasStage.tsx"), "utf8");

    expect(canvasStage).toContain('className="absolute inset-0 overflow-hidden"');
    expect(canvasStage).toContain('className="absolute inset-0"');
  });

  it("grows the scroll frame around tall canvases instead of centering them above scroll zero", () => {
    const canvasStage = readFileSync(resolve(__dirname, "../src/components/CanvasStage.tsx"), "utf8");

    expect(canvasStage).toContain('className="min-h-0 flex-1 overflow-auto"');
    expect(canvasStage).toContain(
      'className="box-border flex h-max min-h-full w-max min-w-full items-center justify-center p-10"'
    );
    expect(canvasStage).toContain(
      'className="relative shrink-0 shadow-2xl ring-1 ring-white/[0.06]"'
    );
    expect(canvasStage).toMatch(
      /className="box-border flex h-max min-h-full w-max min-w-full items-center justify-center p-10"[\s\S]*?onPointerDown=\{onWorkspacePointerDown\}[\s\S]*?onPointerUp=\{onWorkspacePointerUp\}/
    );
  });
});
