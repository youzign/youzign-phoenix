import { removeBackground } from "./bg/removeBackground.js";
import { appendDebugLog, isTauri } from "./native.js";

let installed = false;

function errorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

function installWorkerDiagnostics() {
  const NativeWorker = window.Worker;
  window.Worker = class YouzignDiagnosticWorker extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);
      appendDebugLog({ type: "worker.create", script: String(scriptURL) });
      this.addEventListener("error", (event) => {
        appendDebugLog({
          type: "worker.error",
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      });
      this.addEventListener("messageerror", (event) => {
        appendDebugLog({ type: "worker.messageerror", data: String(event.data) });
      });
    }
  };
}

function capabilityProbes(): Record<string, unknown> {
  return {
    OffscreenCanvas: typeof OffscreenCanvas !== "undefined",
    createImageBitmap: typeof createImageBitmap !== "undefined",
    crossOriginIsolated: window.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    instantiateStreaming: typeof WebAssembly.instantiateStreaming === "function",
  };
}

async function runSelftest() {
  appendDebugLog({ type: "selftest.start", probes: capabilityProbes() });
  try {
    appendDebugLog({ type: "selftest.step", step: "fetch demo portrait" });
    const res = await fetch("/demo-portrait.jpg");
    if (!res.ok) throw new Error(`demo portrait fetch failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    try {
      appendDebugLog({ type: "selftest.step", step: "worker init" });
      const png = await removeBackground(url, {
        maxSide: 640,
        onStage: (stage) => {
          const step =
            stage === "model" ? "ort init" :
            stage === "infer" ? "inference" :
            stage;
          appendDebugLog({ type: "selftest.step", step, stage });
        },
      });
      appendDebugLog({
        type: "selftest.step",
        step: "composite",
        outputBytes: Math.round((png.length * 3) / 4),
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    appendDebugLog({ type: "SELFTEST COMPLETE", ok: true });
  } catch (err) {
    appendDebugLog({ type: "SELFTEST COMPLETE", ok: false, error: errorPayload(err) });
  }
}

export function setupNativeDiagnostics() {
  if (installed || !isTauri()) return;
  installed = true;

  appendDebugLog({ type: "diagnostics.install", href: location.href });

  window.addEventListener("error", (event) => {
    appendDebugLog({
      type: "window.onerror",
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: errorPayload(event.error),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    appendDebugLog({
      type: "window.unhandledrejection",
      reason: errorPayload(event.reason),
    });
  });

  installWorkerDiagnostics();

  if (location.search.includes("selftest")) {
    void runSelftest();
  }
}
