// Main-thread orchestration for local background removal.
//
// Loads an image source (data-URI, local asset, or CORS-enabled remote) through
// a crossOrigin canvas so its pixels are readable, hands the RGBA to the worker
// (U²-Netp inference), and returns a PNG-with-alpha data-URI at the source's
// natural resolution. A single worker is reused across runs so the model + ORT
// session stay warm.

let worker: Worker | null = null;
let reqSeq = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export class BgRemovalError extends Error {}

export interface RemoveOptions {
  /** Called with a coarse stage: "load" | "model" | "infer". */
  onStage?: (stage: string) => void;
  /** Cap the working resolution (longest side) to bound memory/time. */
  maxSide?: number;
}

/** Load an image source into a readable canvas, honouring CORS. */
function loadPixels(
  source: string,
  maxSide: number
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const nW = img.naturalWidth || img.width;
      const nH = img.naturalHeight || img.height;
      if (!nW || !nH) return reject(new BgRemovalError("Image has no pixels."));
      const scale = Math.min(1, maxSide / Math.max(nW, nH));
      const width = Math.max(1, Math.round(nW * scale));
      const height = Math.max(1, Math.round(nH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new BgRemovalError("Canvas unavailable."));
      ctx.drawImage(img, 0, 0, width, height);
      let data: ImageData;
      try {
        data = ctx.getImageData(0, 0, width, height);
      } catch {
        return reject(
          new BgRemovalError("Image is cross-origin protected and can't be read.")
        );
      }
      resolve({ rgba: data.data, width, height });
    };
    img.onerror = () =>
      reject(new BgRemovalError("Couldn't load the image (blocked or offline)."));
    img.src = source;
  });
}

/**
 * Remove the background of an image source. Returns a PNG data-URI with an alpha
 * channel. Throws BgRemovalError with a user-facing message on failure.
 */
export async function removeBackground(
  source: string,
  opts: RemoveOptions = {}
): Promise<string> {
  const maxSide = opts.maxSide ?? 1600;
  opts.onStage?.("load");
  const { rgba, width, height } = await loadPixels(source, maxSide);

  const w = getWorker();
  const id = reqSeq++;

  const result = await new Promise<{ rgba: Uint8ClampedArray; width: number; height: number }>(
    (resolve, reject) => {
      const onMsg = (ev: MessageEvent<any>) => {
        const d = ev.data;
        if (!d || d.id !== id) return;
        if (d.type === "progress") opts.onStage?.(d.stage);
        else if (d.type === "result") {
          cleanup();
          resolve({ rgba: d.rgba, width: d.width, height: d.height });
        } else if (d.type === "error") {
          cleanup();
          reject(new BgRemovalError(d.message || "Background removal failed."));
        }
      };
      const onErr = (e: ErrorEvent) => {
        cleanup();
        reject(new BgRemovalError(e.message || "Worker crashed during removal."));
      };
      const cleanup = () => {
        w.removeEventListener("message", onMsg);
        w.removeEventListener("error", onErr as EventListener);
      };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr as EventListener);
      // Copy the buffer for transfer (getImageData buffer is owned by canvas).
      const copy = new Uint8ClampedArray(rgba);
      w.postMessage(
        { type: "run", id, rgba: copy, width, height },
        [copy.buffer]
      );
    }
  );

  // Repack the cutout RGBA into a PNG data-URI.
  const outCanvas = document.createElement("canvas");
  outCanvas.width = result.width;
  outCanvas.height = result.height;
  const octx = outCanvas.getContext("2d");
  if (!octx) throw new BgRemovalError("Canvas unavailable.");
  octx.putImageData(
    new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height),
    0,
    0
  );
  return outCanvas.toDataURL("image/png");
}
