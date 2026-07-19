import { describe, expect, it, vi } from "vitest";
import {
  BugReportError,
  buildBugReportPayload,
  submitBugReport,
  validateBugReportInput,
} from "../src/library/bugReport.js";

const baseInput = {
  category: "import" as const,
  description: "Import hangs on a 40MB PSD.",
  email: "user@example.com",
  appVersion: "1.2.3",
  platform: "test-ua | browser",
};

describe("buildBugReportPayload", () => {
  it("assembles a trimmed, normalized payload", () => {
    const payload = buildBugReportPayload({
      ...baseInput,
      email: "  User@Example.com  ",
      description: "  trimmed  ",
    });
    expect(payload).toMatchObject({
      category: "import",
      description: "trimmed",
      email: "user@example.com",
      appVersion: "1.2.3",
      platform: "test-ua | browser",
    });
    expect(payload.designName).toBeUndefined();
    expect(payload.designXmlSnippet).toBeUndefined();
    expect(payload.screenshot).toBeUndefined();
  });

  it("truncates a design XML snippet to 2000 chars and drops an empty design name", () => {
    const longXml = "x".repeat(3000);
    const payload = buildBugReportPayload({
      ...baseInput,
      designName: "   ",
      designXmlSnippet: longXml,
    });
    expect(payload.designName).toBeUndefined();
    expect(payload.designXmlSnippet).toHaveLength(2000);
  });

  it("falls back to APP_VERSION and a detected platform when omitted", () => {
    const payload = buildBugReportPayload({
      category: "other",
      description: "desc",
      email: "a@b.com",
    });
    expect(payload.appVersion).toBeTruthy();
    expect(payload.platform).toBeTruthy();
  });
});

describe("validateBugReportInput", () => {
  it("accepts a well-formed input", () => {
    expect(validateBugReportInput(baseInput)).toBeNull();
  });

  it("rejects an unknown category", () => {
    expect(validateBugReportInput({ ...baseInput, category: "nope" as never })).toMatch(/category/i);
  });

  it("rejects an empty description", () => {
    expect(validateBugReportInput({ ...baseInput, description: "   " })).toMatch(/describe/i);
  });

  it("rejects a malformed email", () => {
    expect(validateBugReportInput({ ...baseInput, email: "not-an-email" })).toMatch(/email/i);
  });
});

describe("submitBugReport", () => {
  it("posts the built payload as JSON to the bug report endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await submitBugReport(baseInput, { fetchImpl, url: "https://example.com/api/bugreport" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.com/api/bugreport");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ category: "import", email: "user@example.com" });
  });

  it("throws a validation BugReportError without ever calling fetch", async () => {
    const fetchImpl = vi.fn();
    await expect(
      submitBugReport({ ...baseInput, email: "bad" }, { fetchImpl })
    ).rejects.toMatchObject({ code: "validation" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a network failure to a network BugReportError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const err = await submitBugReport(baseInput, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(BugReportError);
    expect(err.code).toBe("network");
  });

  it("maps a 413 response to a too_large BugReportError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 413 }));
    const err = await submitBugReport(baseInput, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(BugReportError);
    expect(err.code).toBe("too_large");
  });

  it("maps a 400 response with a server error message to a validation BugReportError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid category" }), { status: 400 })
    );
    const err = await submitBugReport(baseInput, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(BugReportError);
    expect(err.code).toBe("validation");
    expect(err.message).toBe("Invalid category");
  });

  it("maps any other non-ok response to a server BugReportError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const err = await submitBugReport(baseInput, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(BugReportError);
    expect(err.code).toBe("server");
  });
});
