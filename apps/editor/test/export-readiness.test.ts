import { describe, expect, it, vi } from "vitest";
import {
  ensureExportImages,
  EXPORT_IMAGE_TIMEOUT_MS,
} from "../src/export/exportReadiness.js";

function pendingImage() {
  const listeners = new Map<string, () => void>();
  return {
    complete: false,
    decode: vi.fn(async () => undefined),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener as () => void);
    }),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    dispatch(type: "load" | "error") {
      listeners.get(type)?.();
    },
  };
}

function rootWith(...images: ReturnType<typeof pendingImage>[]) {
  return { querySelectorAll: vi.fn(() => images) };
}

describe("ensureExportImages", () => {
  it("does not resolve until every incomplete image layer has loaded", async () => {
    const first = pendingImage();
    const second = pendingImage();
    let resolved = false;

    const ready = ensureExportImages([rootWith(first, second) as never]).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    first.dispatch("load");
    await Promise.resolve();
    expect(resolved).toBe(false);

    second.dispatch("load");
    await ready;
    expect(first.decode).toHaveBeenCalledOnce();
    expect(second.decode).toHaveBeenCalledOnce();
  });

  it("decodes already-loaded image layers before capture", async () => {
    const image = pendingImage();
    image.complete = true;

    await ensureExportImages([rootWith(image) as never]);

    expect(image.addEventListener).not.toHaveBeenCalled();
    expect(image.decode).toHaveBeenCalledOnce();
  });

  it("does not miss an image that completes while listeners are attached", async () => {
    const image = pendingImage();
    image.addEventListener.mockImplementation((type, listener) => {
      if (type === "load") image.complete = true;
      void listener;
    });

    await ensureExportImages([rootWith(image) as never]);

    expect(image.decode).toHaveBeenCalledOnce();
  });

  it("continues when an image errors so the rendered fallback can be captured", async () => {
    const image = pendingImage();
    const ready = ensureExportImages([rootWith(image) as never]);

    image.dispatch("error");
    await ready;

    expect(image.decode).toHaveBeenCalledOnce();
  });

  it("fails instead of hanging or exporting an image layer that never settles", async () => {
    vi.useFakeTimers();
    try {
      const image = pendingImage();
      const ready = ensureExportImages([rootWith(image) as never]);
      const assertion = expect(ready).rejects.toThrow(
        "An image layer did not finish loading before export."
      );

      await vi.advanceTimersByTimeAsync(EXPORT_IMAGE_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
