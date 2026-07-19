const RESEND_API_KEY = process.env.RESEND_API_KEY;
// dezygn.com is the verified sending domain on the current Resend free plan (1 domain max);
// switch to an @youzign.com sender after upgrading the plan and verifying youzign.com. Mirrors
// the convention in subscribe.js.
const FROM_EMAIL = "Youzign <youzign@dezygn.com>";
const SUPPORT_EMAIL = "support@youzign.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = ["import", "export", "text", "thumbnails", "other"];
const CATEGORY_LABELS = {
  import: "Design import",
  export: "Export",
  text: "Text",
  thumbnails: "Dashboard & thumbnails",
  other: "Other",
};

// Screenshot data URLs are base64 (~4/3 the byte size); cap the raw string
// length so a ~4MB image comfortably fits, plus headroom for the mime prefix.
const MAX_SCREENSHOT_DATA_URL_LENGTH = 6 * 1024 * 1024;
const MAX_XML_SNIPPET_LENGTH = 2000;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const raw = await readRawBody(req);
  return JSON.parse(raw || "{}");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

function applyCors(res) {
  const headers = corsHeaders();
  for (const key of Object.keys(headers)) res.setHeader(key, headers[key]);
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mime, isBase64, data] = match;
  if (!isBase64) return null; // only base64-encoded data URLs are accepted
  return { mime: mime || "application/octet-stream", base64: data };
}

function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

/** REPORT_VERSION: 1 — a rigid key: value block so an LLM/parser can extract
 * fields reliably. DESCRIPTION is wrapped in a delimited block since it may
 * contain newlines/colons that would otherwise break line-based parsing. */
function reportBody(payload) {
  const lines = [
    "REPORT_VERSION: 1",
    `CATEGORY: ${payload.category}`,
    `EMAIL: ${payload.email}`,
    `APP_VERSION: ${payload.appVersion}`,
    `PLATFORM: ${payload.platform}`,
    `DESIGN_NAME: ${payload.designName || "(none)"}`,
    "DESCRIPTION_START",
    payload.description,
    "DESCRIPTION_END",
  ];
  return lines.join("\n");
}

function emailHtml(payload) {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `
    <div style="margin:0;padding:0;background:#0e1116;color:#eef2f7;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:36px 24px;">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;color:#ffffff;">New bug report</h1>
        <pre style="margin:0;padding:16px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:#151a21;color:#c8d2de;font-size:13px;line-height:1.6;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;">${esc(
          reportBody(payload)
        )}</pre>
      </div>
    </div>
  `;
}

function subjectFor(payload) {
  const trimmed = payload.description.slice(0, 60);
  return `[YZ-BUG][${payload.category}] ${trimmed}`;
}

function validate(body) {
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const appVersion = String(body.appVersion || "").trim() || "unknown";
  const platform = String(body.platform || "").trim() || "unknown";
  const designName = body.designName ? String(body.designName).trim() : "";
  const designXmlSnippet = body.designXmlSnippet ? String(body.designXmlSnippet).slice(0, MAX_XML_SNIPPET_LENGTH) : "";
  const screenshot = body.screenshot ? String(body.screenshot) : "";

  if (!CATEGORIES.includes(category)) {
    return { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` };
  }
  if (!description) {
    return { error: "Description is required" };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Invalid email" };
  }
  if (screenshot && screenshot.length > MAX_SCREENSHOT_DATA_URL_LENGTH) {
    return { error: "Screenshot too large", status: 413 };
  }

  return {
    payload: {
      category,
      categoryLabel: CATEGORY_LABELS[category],
      description,
      email,
      appVersion,
      platform,
      designName,
      designXmlSnippet,
      screenshot,
    },
  };
}

function buildAttachments(payload) {
  const attachments = [];

  if (payload.screenshot) {
    const parsed = parseDataUrl(payload.screenshot);
    if (parsed) {
      attachments.push({
        filename: `screenshot.${extensionForMime(parsed.mime)}`,
        content: parsed.base64,
      });
    }
  }

  if (payload.designXmlSnippet) {
    attachments.push({
      filename: "design-snippet.txt",
      content: Buffer.from(payload.designXmlSnippet, "utf8").toString("base64"),
    });
  }

  return attachments;
}

async function sendBugReportEmail(payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      reply_to: payload.email,
      subject: subjectFor(payload),
      html: emailHtml(payload),
      attachments: buildAttachments(payload),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email failed: ${response.status} ${await response.text()}`);
  }
}

module.exports = async function bugreport(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const { error, status, payload } = validate(body);
  if (error) {
    return res.status(status || 400).json({ ok: false, error });
  }

  if (!RESEND_API_KEY) {
    console.warn("Resend env var missing; skipping bug report email.");
    return res.status(200).json({ ok: true, emailSent: false });
  }

  try {
    await sendBugReportEmail(payload);
    return res.status(200).json({ ok: true, emailSent: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true, emailSent: false });
  }
};
