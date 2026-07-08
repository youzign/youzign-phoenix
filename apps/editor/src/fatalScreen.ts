import type { DebugRecord } from "./native.js";

const DEBUG_LOG_HELP =
  "Support can help. Share the youzign-debug.log file from your Youzign app data folder.";

export type FatalErrorDetails = {
  name: string;
  message: string;
  stack?: string;
};

export function fatalErrorDetails(err: unknown): FatalErrorDetails {
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || "Unknown startup error",
      stack: err.stack,
    };
  }
  return {
    name: "Error",
    message: String(err || "Unknown startup error"),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fatalScreenHtml(err: unknown): string {
  const details = fatalErrorDetails(err);
  return `
    <main style="min-height:100vh;margin:0;box-sizing:border-box;background:#101014;color:#f7f7fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;padding:32px;">
      <section style="max-width:680px;width:100%;">
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;">Youzign couldn't start</h1>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#1d1d24;border:1px solid #34343d;border-radius:8px;padding:16px;margin:0 0 16px;color:#ffffff;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(details.name)}: ${escapeHtml(details.message)}</pre>
        <p style="font-size:15px;line-height:1.6;margin:0;color:#c9c9d4;">${DEBUG_LOG_HELP}</p>
      </section>
    </main>
  `;
}

export function renderFatalScreen(container: Pick<HTMLElement, "innerHTML">, err: unknown): void {
  container.innerHTML = fatalScreenHtml(err);
}

export function fatalDebugRecord(type: string, err: unknown): DebugRecord {
  return { type, error: fatalErrorDetails(err) };
}

export { DEBUG_LOG_HELP };
