// Structured in-app bug reports. Payload assembly is pure (unit-testable
// without a DOM/fetch); submitBugReport() posts it to the landing site's
// Vercel function, which relays a machine-parsable email to support@youzign.com.
import { APP_VERSION } from "../version.js";
import { isTauri } from "../native.js";

export const BUG_REPORT_URL = "https://www.youzign.com/api/bugreport";
export const BUG_REPORT_EMAIL_KEY = "youzign-bugreport-email";

export const BUG_CATEGORIES = [
  { value: "import", label: "Design import" },
  { value: "export", label: "Export" },
  { value: "text", label: "Text" },
  { value: "thumbnails", label: "Dashboard & thumbnails" },
  { value: "other", label: "Other" },
] as const;

export type BugCategory = (typeof BUG_CATEGORIES)[number]["value"];

// Screenshots are capped well under Resend's ~40MB request limit; 4MB of raw
// image data is roughly 5.3MB once base64-encoded, so this bounds the file
// picked in the UI (the API also re-checks the encoded size server-side).
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_XML_SNIPPET_LENGTH = 2000;

export interface BugReportInput {
  category: BugCategory;
  description: string;
  email: string;
  appVersion?: string;
  platform?: string;
  designName?: string;
  designXmlSnippet?: string;
  screenshot?: string; // data URL
}

export interface BugReportPayload {
  category: BugCategory;
  description: string;
  email: string;
  appVersion: string;
  platform: string;
  designName?: string;
  designXmlSnippet?: string;
  screenshot?: string;
}

export function detectPlatform(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  return `${ua} | ${isTauri() ? "tauri-native" : "browser"}`;
}

export function buildBugReportPayload(input: BugReportInput): BugReportPayload {
  return {
    category: input.category,
    description: input.description.trim(),
    email: input.email.trim().toLowerCase(),
    appVersion: input.appVersion || APP_VERSION,
    platform: input.platform || detectPlatform(),
    designName: input.designName?.trim() || undefined,
    designXmlSnippet: input.designXmlSnippet ? input.designXmlSnippet.slice(0, MAX_XML_SNIPPET_LENGTH) : undefined,
    screenshot: input.screenshot || undefined,
  };
}

export type BugReportErrorCode = "validation" | "too_large" | "network" | "server";

export class BugReportError extends Error {
  constructor(public readonly code: BugReportErrorCode, message?: string) {
    super(message || code);
    this.name = "BugReportError";
  }
}

export function validateBugReportInput(input: BugReportInput): string | null {
  if (!BUG_CATEGORIES.some((c) => c.value === input.category)) return "Choose a category.";
  if (!input.description.trim()) return "Describe the bug.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Enter a valid email.";
  return null;
}

type FetchImpl = typeof fetch;

export async function submitBugReport(
  input: BugReportInput,
  opts: { fetchImpl?: FetchImpl; url?: string } = {}
): Promise<void> {
  const validationError = validateBugReportInput(input);
  if (validationError) throw new BugReportError("validation", validationError);

  const payload = buildBugReportPayload(input);
  const fetchImpl = opts.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(opts.url ?? BUG_REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new BugReportError("network", "Couldn't connect. Check your internet connection and try again.");
  }

  if (response.status === 413) {
    throw new BugReportError("too_large", "That screenshot is too large.");
  }
  if (response.status === 400) {
    let message = "Please check the form and try again.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore — fall back to default message
    }
    throw new BugReportError("validation", message);
  }
  if (!response.ok) {
    throw new BugReportError("server", "Couldn't submit your report. Please try again.");
  }
}
