import { getFontEmbedCSS, toJpeg, toPng } from "html-to-image";

type CaptureOptions = NonNullable<Parameters<typeof toPng>[1]>;

export interface StableCaptureOptions {
  /** Maximum number of capture attempts before giving up. */
  maxAttempts?: number;
  /** Extra delay (ms) between attempts, on top of a double requestAnimationFrame. */
  delayMs?: number;
  /**
   * Checked before every attempt (including the first); when it returns
   * `true` the retry loop stops early without calling `capture` again. Used
   * to bail out as soon as the captured node is detached (e.g. the user
   * navigated away mid-capture) instead of burning the remaining attempts.
   */
  isCancelled?: () => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 30;

/**
 * html-to-image (via `toDataURL` on a detached/zero-size canvas) returns the
 * literal string `"data:,"` instead of throwing when it can't rasterize a
 * node. A result only counts as a real image if it has the right prefix
 * *and* a non-empty base64 payload after the comma — otherwise `captureStable`
 * would happily treat two consecutive `"data:,"` results as "stable" and
 * hand a broken thumbnail back to the caller.
 */
function isValidCapture(result: string): boolean {
  return typeof result === "string" && /^data:image\/[a-z0-9.+-]+;base64,.+/i.test(result);
}

function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function settle(delayMs: number): Promise<void> {
  // A double rAF gives WebKit a full render pass to finish decoding the
  // subresource images inside html-to-image's cloned foreignObject SVG
  // before the next attempt (see captureStable's doc comment).
  await nextFrame();
  await nextFrame();
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * WebKit/Safari has a long-standing bug: subresource images inside an SVG
 * `<foreignObject>` are not guaranteed to be loaded/decoded when the SVG's
 * `load` event fires, so html-to-image's first capture of a DOM node with
 * large `<img>` layers can draw them blank. Once those images finish
 * decoding, consecutive captures are byte-identical. This calls `capture`
 * up to `maxAttempts` times and returns as soon as two consecutive *valid*
 * results match. Chrome (and WebKit once images are decoded) typically
 * matches on the very first repeat, at negligible extra cost. The largest
 * valid result seen across all attempts is also tracked and returned as a
 * fallback if nothing ever matches within `maxAttempts` — a render with more
 * actual photo content reliably encodes larger than one with fewer decoded
 * layers. Invalid results (see `isValidCapture`) are never treated as
 * "stable" and never used as the fallback; if every attempt is invalid (or
 * `isCancelled` fires before a valid capture is produced) this throws —
 * callers must fall back to a previously known-good value themselves.
 */
export async function captureStable(
  capture: () => Promise<string>,
  opts: StableCaptureOptions = {}
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const isCancelled = opts.isCancelled ?? (() => false);
  let previous: string | null = null;
  let best = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isCancelled()) break;
    const result = await capture();
    if (isValidCapture(result)) {
      if (result.length >= best.length) best = result;
      if (previous !== null && result === previous) return result;
      previous = result;
    } else {
      // Never let an invalid result count toward "two consecutive matches".
      previous = null;
    }
    if (attempt < maxAttempts) await settle(delayMs);
  }
  if (!isValidCapture(best)) {
    throw new Error("captureStable: no valid image capture was produced (node may be detached)");
  }
  return best;
}

/**
 * html-to-image re-fetches and re-embeds page web fonts (`getFontEmbedCSS`)
 * on every single capture call. That fetch fails in most app contexts
 * anyway (cross-origin stylesheet), but redoing it on every retry attempt
 * was found to starve the image-decode work the retries exist to wait for,
 * making WebKit's foreignObject bug (see captureStable) *never* resolve.
 * Resolving it once per captureStable run and passing the result back in
 * via `fontEmbedCSS` (the option html-to-image's own docs recommend for
 * reuse across calls) keeps font embedding best-effort without repeating
 * that cost on every attempt.
 */
async function resolveFontEmbedCSS(node: HTMLElement, options: CaptureOptions): Promise<string> {
  if (options.fontEmbedCSS !== undefined) return options.fontEmbedCSS;
  try {
    return await getFontEmbedCSS(node, options);
  } catch {
    return "";
  }
}

/** WebKit-safe PNG capture of `node` via html-to-image (see captureStable). */
export async function capturePngStable(node: HTMLElement, options: CaptureOptions): Promise<string> {
  const fontEmbedCSS = await resolveFontEmbedCSS(node, options);
  return captureStable(() => toPng(node, { ...options, fontEmbedCSS }), {
    isCancelled: () => node.isConnected === false,
  });
}

/** WebKit-safe JPEG capture of `node` via html-to-image (see captureStable). */
export async function captureJpegStable(node: HTMLElement, options: CaptureOptions): Promise<string> {
  const fontEmbedCSS = await resolveFontEmbedCSS(node, options);
  return captureStable(() => toJpeg(node, { ...options, fontEmbedCSS }), {
    isCancelled: () => node.isConnected === false,
  });
}
