import { useEffect, useRef, useState } from "react";
import { allDocuments, type DocumentRecord } from "../library/documents.js";
import {
  BUG_CATEGORIES,
  BUG_REPORT_EMAIL_KEY,
  BugReportError,
  MAX_SCREENSHOT_BYTES,
  submitBugReport,
  type BugCategory,
} from "../library/bugReport.js";
import { Icon, accentBtn, ghostBtn } from "./ui.js";

const SCREENSHOT_ACCEPT = "image/png,image/jpeg";

function readPrefillEmail(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(BUG_REPORT_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function savePrefillEmail(email: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BUG_REPORT_EMAIL_KEY, email);
  } catch {
    // best-effort only
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BugReportModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<BugCategory>("other");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(() => readPrefillEmail());
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [designId, setDesignId] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void allDocuments().then(setDocs);
  }, []);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [busy, onClose]);

  const selectedDoc = docs.find((doc) => doc.id === designId);

  const pickScreenshot = async (file: File | undefined) => {
    setError("");
    if (!file) {
      setScreenshotName("");
      setScreenshotDataUrl("");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError("Screenshot must be 4MB or smaller.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setScreenshotName(file.name);
    setScreenshotDataUrl(await fileToDataUrl(file));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submitBugReport({
        category,
        description,
        email,
        designName: selectedDoc?.name,
        designXmlSnippet: selectedDoc?.pages[0],
        screenshot: screenshotDataUrl || undefined,
      });
      savePrefillEmail(email.trim().toLowerCase());
      setDone(true);
    } catch (err) {
      setError(
        err instanceof BugReportError
          ? err.message
          : "Couldn't submit your report. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#202024] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="bug-report-modal"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] p-5">
          <div>
            <h2 id="bug-report-title" className="text-[15px] font-semibold text-neutral-100">
              Report a bug
            </h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              Tell us what happened — it goes straight to support.
            </p>
          </div>
          <button className={ghostBtn} onClick={onClose} disabled={busy} aria-label="Close">
            Close
          </button>
        </header>

        {done ? (
          <div className="p-5">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-neutral-100">
              <Icon name="check" size={18} className="text-[var(--accent)]" />
              Thanks — we got it
            </div>
            <p className="mt-2 text-[13px] leading-6 text-neutral-500">
              We'll follow up at {email} if we need more details.
            </p>
            <button className={`${accentBtn} mt-5`} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="min-h-0 flex-1 overflow-y-auto p-5" onSubmit={(event) => void submit(event)}>
            <label className="block text-[12px] font-medium text-neutral-300" htmlFor="bug-category">
              Category
            </label>
            <select
              id="bug-category"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value as BugCategory)}
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] text-neutral-100 outline-none transition-colors focus:border-[var(--accent)]"
            >
              {BUG_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-[12px] font-medium text-neutral-300" htmlFor="bug-description">
              What happened?
            </label>
            <textarea
              id="bug-description"
              autoFocus
              required
              rows={5}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Steps to reproduce, what you expected, what happened instead…"
              className="mt-2 w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] leading-5 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[var(--accent)]"
            />

            <label className="mt-4 block text-[12px] font-medium text-neutral-300" htmlFor="bug-email">
              Your email
            </label>
            <input
              id="bug-email"
              type="email"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[var(--accent)]"
            />

            {docs.length > 0 && (
              <>
                <label className="mt-4 block text-[12px] font-medium text-neutral-300" htmlFor="bug-design">
                  Design (optional)
                </label>
                <select
                  id="bug-design"
                  value={designId}
                  disabled={busy}
                  onChange={(event) => setDesignId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] text-neutral-100 outline-none transition-colors focus:border-[var(--accent)]"
                >
                  <option value="">None</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
                {selectedDoc && (
                  <p className="mt-1.5 text-[11px] text-neutral-500">
                    We'll attach the design name and a snippet of its XML.
                  </p>
                )}
              </>
            )}

            <label className="mt-4 block text-[12px] font-medium text-neutral-300" htmlFor="bug-screenshot">
              Screenshot (optional, max 4MB)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className={ghostBtn}
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" size={15} /> Choose file
              </button>
              <span className="truncate text-[12px] text-neutral-500">{screenshotName || "No file chosen"}</span>
              <input
                id="bug-screenshot"
                ref={fileInputRef}
                type="file"
                accept={SCREENSHOT_ACCEPT}
                className="hidden"
                disabled={busy}
                onChange={(event) => void pickScreenshot(event.target.files?.[0])}
              />
            </div>

            {error && (
              <div className="mt-4 text-[12px] text-red-300" role="alert">
                {error}
              </div>
            )}

            <button className={`${accentBtn} mt-5`} type="submit" disabled={busy || !description.trim() || !email.trim()}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
