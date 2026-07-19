import { describe, expect, it, vi } from "vitest";
import { captureStable } from "../src/export/capture.js";

// html-to-image results are always `data:image/<mime>;base64,<payload>`; use
// that shape for every fixture below so "stable" behavior is exercised the
// same way real captures would be, and so a plain placeholder string doesn't
// accidentally read as a valid capture.
const A = "data:image/png;base64,AAAA";
const B = "data:image/png;base64,BBBB";
const BLANK = "data:image/png;base64,blank";
const FULL = "data:image/png;base64,fully-decoded-render";
const PARTIAL = "data:image/png;base64,partial-render";
// What html-to-image's toDataURL returns for a detached/zero-size node —
// the literal empty data URL, not a real image.
const EMPTY = "data:,";

describe("captureStable", () => {
  it("stops once two consecutive results match (first call A, then B, then B)", async () => {
    const capture = vi.fn().mockResolvedValueOnce(A).mockResolvedValueOnce(B).mockResolvedValueOnce(B);

    const result = await captureStable(capture, { delayMs: 0 });

    expect(result).toBe(B);
    expect(capture).toHaveBeenCalledTimes(3);
  });

  it("matches on the very first repeat when every attempt already agrees (Chrome-like)", async () => {
    const capture = vi.fn().mockResolvedValue("data:image/png;base64,stable-result");

    const result = await captureStable(capture, { delayMs: 0, maxAttempts: 5 });

    expect(result).toBe("data:image/png;base64,stable-result");
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("falls back to the largest result seen if nothing stabilizes within maxAttempts, without throwing", async () => {
    const capture = vi
      .fn()
      .mockResolvedValueOnce(BLANK)
      .mockResolvedValueOnce(FULL)
      .mockResolvedValueOnce(BLANK)
      .mockResolvedValueOnce(PARTIAL);

    const result = await captureStable(capture, { delayMs: 0, maxAttempts: 4 });

    expect(result).toBe(FULL);
    expect(capture).toHaveBeenCalledTimes(4);
  });

  it("respects a custom maxAttempts cap", async () => {
    const capture = vi.fn().mockResolvedValue("data:image/png;base64,x");

    await captureStable(capture, { delayMs: 0, maxAttempts: 2 });

    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("returns the single result when maxAttempts is 1", async () => {
    const capture = vi.fn().mockResolvedValue("data:image/png;base64,only-attempt");

    const result = await captureStable(capture, { delayMs: 0, maxAttempts: 1 });

    expect(result).toBe("data:image/png;base64,only-attempt");
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("never returns the empty 'data:,' result as stable, and throws if every attempt is invalid", async () => {
    const capture = vi.fn().mockResolvedValue(EMPTY);

    await expect(captureStable(capture, { delayMs: 0, maxAttempts: 2 })).rejects.toThrow();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("skips an invalid capture and returns the first valid result that repeats (invalid, then V, then V)", async () => {
    const V = "data:image/png;base64,VVVV";
    const capture = vi.fn().mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(V).mockResolvedValueOnce(V);

    const result = await captureStable(capture, { delayMs: 0, maxAttempts: 5 });

    expect(result).toBe(V);
    expect(capture).toHaveBeenCalledTimes(3);
  });

  it("never uses an invalid result as the best-fallback either", async () => {
    const V = "data:image/png;base64,VVVVVVVVVVVVVVVVVVVV"; // longer than EMPTY, but EMPTY must still lose on validity, not length
    const capture = vi.fn().mockResolvedValueOnce(V).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY);

    const result = await captureStable(capture, { delayMs: 0, maxAttempts: 3 });

    expect(result).toBe(V);
  });

  it("stops retrying as soon as isCancelled reports the node is gone, and throws with no valid result yet", async () => {
    let cancelled = false;
    const capture = vi.fn().mockImplementation(async () => {
      // Simulate the node being unmounted mid-capture (e.g. the user
      // navigated back to the dashboard while this await was pending).
      cancelled = true;
      return EMPTY;
    });

    await expect(
      captureStable(capture, { delayMs: 0, maxAttempts: 5, isCancelled: () => cancelled })
    ).rejects.toThrow();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("does not call capture at all if isCancelled is already true", async () => {
    const capture = vi.fn().mockResolvedValue("data:image/png;base64,unused");

    await expect(
      captureStable(capture, { delayMs: 0, maxAttempts: 5, isCancelled: () => true })
    ).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
});
