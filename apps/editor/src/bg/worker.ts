/// <reference lib="webworker" />
//
// Background-removal Web Worker. Runs U²-Netp (Apache-2.0, ~4.5MB) entirely on
// the user's device via onnxruntime-web. WebGPU is used when available, with a
// WASM CPU fallback. The model is fetched once from /models/u2netp.onnx and
// cached by the browser (HTTP cache + the ORT session is kept warm in memory),
// so subsequent removals never re-download.

// The CPU-only WASM build (no JSEP/WebGPU glue) — only needs
// ort-wasm-simd-threaded.{wasm,mjs}, which we serve locally from /ort/.
import * as ort from "onnxruntime-web/wasm";
import {
  BG_MODEL_INPUT,
  computeLetterbox,
  normalizeToTensor,
  maskToAlphaImage,
  compositeAlpha,
} from "@youzign/editor-core";
import { asset } from "../asset.js";

// Serve the WASM runtime locally (copied into public/ort/) — fully offline.
// import.meta.env.BASE_URL is available in bundled module workers just like
// in the main app, so this respects the app's base path ("/" for Tauri/dev,
// "/editor/" for the web deployment).
ort.env.wasm.wasmPaths = asset("/ort/");
// Single-threaded avoids the cross-origin-isolation (SharedArrayBuffer)
// requirement, so it works without special COOP/COEP dev headers.
ort.env.wasm.numThreads = 1;

const MODEL_URL = asset("/models/u2netp.onnx");

let sessionPromise: Promise<{ session: ort.InferenceSession; backend: string }> | null = null;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const resp = await fetch(MODEL_URL);
      if (!resp.ok) throw new Error(`Model download failed (${resp.status})`);
      const buf = new Uint8Array(await resp.arrayBuffer());
      // Backend: WASM CPU. WebGPU is intentionally NOT used for U²-Net — its
      // encoder uses MaxPool with ceil_mode, which the onnxruntime-web WebGPU
      // (JSEP) kernel does not support ("using ceil() in shape computation is
      // not yet supported for MaxPool"), so it errors at run time. WASM (SIMD)
      // runs the full graph correctly and, for the small u2netp at ≤1600px, is
      // fast enough (~1-3s on a modern laptop).
      const session = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
      });
      return { session, backend: "wasm" };
    })();
  }
  return sessionPromise;
}

interface RunMsg {
  type: "run";
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

async function run(msg: RunMsg) {
  const { id, rgba, width, height } = msg;
  const post = (stage: string) =>
    (self as unknown as Worker).postMessage({ type: "progress", id, stage });

  post("model");
  const { session, backend } = await getSession();

  // --- preprocess: letterbox the source into a 320×320 square -------------
  post("infer");
  const size = BG_MODEL_INPUT;
  const lb = computeLetterbox(width, height, size);

  const srcCanvas = new OffscreenCanvas(width, height);
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  const sq = new OffscreenCanvas(size, size);
  const sqCtx = sq.getContext("2d")!;
  sqCtx.clearRect(0, 0, size, size);
  sqCtx.drawImage(srcCanvas, 0, 0, width, height, lb.dx, lb.dy, lb.drawW, lb.drawH);
  const sqData = sqCtx.getImageData(0, 0, size, size).data;

  const tensor = new ort.Tensor(
    "float32",
    normalizeToTensor(sqData, size),
    [1, 3, size, size]
  );

  // --- inference ---------------------------------------------------------
  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: tensor };
  const out = await session.run(feeds);
  const maskTensor = out[session.outputNames[0]];
  const mask = maskTensor.data as Float32Array;

  // --- postprocess: matte → alpha at original resolution -----------------
  const maskAlpha = maskToAlphaImage(mask, size);
  const maskCanvas = new OffscreenCanvas(size, size);
  const maskCtx = maskCanvas.getContext("2d")!;
  maskCtx.putImageData(new ImageData(new Uint8ClampedArray(maskAlpha), size, size), 0, 0);

  // Crop the letterboxed region back out and scale to source resolution.
  const alphaCanvas = new OffscreenCanvas(width, height);
  const alphaCtx = alphaCanvas.getContext("2d")!;
  alphaCtx.imageSmoothingEnabled = true;
  alphaCtx.imageSmoothingQuality = "high";
  alphaCtx.drawImage(
    maskCanvas,
    lb.dx,
    lb.dy,
    lb.drawW,
    lb.drawH,
    0,
    0,
    width,
    height
  );
  const alphaData = alphaCtx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alphaData[i * 4 + 3];

  const result = compositeAlpha(rgba, alpha, width, height);

  (self as unknown as Worker).postMessage(
    { type: "result", id, rgba: result, width, height, backend },
    { transfer: [result.buffer] }
  );
}

self.onmessage = (ev: MessageEvent<RunMsg>) => {
  if (ev.data?.type !== "run") return;
  run(ev.data).catch((err) => {
    (self as unknown as Worker).postMessage({
      type: "error",
      id: ev.data.id,
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
