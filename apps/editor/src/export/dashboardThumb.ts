import { captureJpegStable } from "./capture.js";
import { ensureExportImages } from "./exportReadiness.js";
import type { DocumentRecord } from "../library/documents.js";

/** Split out from App.tsx so it can be unit-tested without pulling in React. */

function isNodeLive(node: HTMLElement): boolean {
  if (!node.isConnected) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Capture a small JPEG thumbnail of the live `.yz-canvas` node for the
 * dashboard. The WebKit-safe stable-capture retries (see capture.ts) await
 * across several rAFs and a font-embed fetch; if the user navigates back to
 * the dashboard mid-capture, `.yz-canvas` gets unmounted. Re-check liveness
 * after every await, and on any bail-out (or a thrown/invalid capture) fall
 * back to the previously stored thumb instead of persisting a broken one.
 */
export async function captureDashboardThumb(previous?: DocumentRecord | null): Promise<string | undefined> {
  const node = document.querySelector<HTMLElement>(".yz-canvas");
  if (!node) return previous?.thumb;
  const rect = node.getBoundingClientRect();
  const longest = Math.max(rect.width, rect.height);
  const pixelRatio = longest > 0 ? Math.min(1, 320 / longest) : 0.25;
  try {
    // The autosave debounce can fire while a just-loaded design's data-URI
    // images are still decoding; wait for the originals before capturing.
    await ensureExportImages([node]);
    // The user may have navigated away from this design during the await
    // above; bail to the previous thumb rather than capturing (or letting
    // captureJpegStable throw on) a detached/zero-size node.
    if (!isNodeLive(node)) return previous?.thumb;
    return await captureJpegStable(node, {
      quality: 0.72,
      pixelRatio,
      cacheBust: false,
      backgroundColor: "#ffffff",
    });
  } catch {
    return previous?.thumb;
  }
}
