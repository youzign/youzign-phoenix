const fs = require("fs");
const path = require("path");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
// dezygn.com is the verified sending domain on the current Resend free plan (1 domain max);
// switch to an @youzign.com sender after upgrading the plan and verifying youzign.com.
const FROM_EMAIL = "Youzign <youzign@dezygn.com>";
const TESTIMONIAL_URL = "https://forms.endorsal.io/form/5df0c2d94264b34634388361";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readDownloads() {
  const file = path.join(__dirname, "..", "downloads.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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

function downloadRows(downloads) {
  return ["mac", "win", "linux"].map((key) => {
    const item = downloads[key];
    return `<p style="margin:0 0 10px;"><a href="${item.url}" style="color:#0aa5f5;font-weight:700;text-decoration:none;">${item.label}</a></p>`;
  }).join("");
}

function emailHtml(downloads) {
  return `
    <div style="margin:0;padding:0;background:#0e1116;color:#eef2f7;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:620px;margin:0 auto;padding:36px 24px;">
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#ffffff;">Your Youzign download is ready</h1>
        <p style="margin:0 0 18px;color:#c8d2de;font-size:16px;line-height:1.6;">Youzign is back, redesigned as a free, open-source desktop app. Free forever was the promise. This is that promise kept.</p>
        <div style="margin:24px 0;padding:22px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:#151a21;">
          <h2 style="margin:0 0 14px;font-size:18px;color:#ffffff;">Download links</h2>
          ${downloadRows(downloads)}
        </div>
        <p style="margin:0 0 10px;color:#9aa7b5;font-size:14px;line-height:1.6;">Windows may show SmartScreen because this is a brand-new unsigned app. Click <strong style="color:#eef2f7;">More info</strong>, then <strong style="color:#eef2f7;">Run anyway</strong>.</p>
        <p style="margin:0 0 22px;color:#9aa7b5;font-size:14px;line-height:1.6;">On macOS, if Gatekeeper blocks the first launch, right-click the app and choose <strong style="color:#eef2f7;">Open</strong>.</p>
        <p style="margin:0 0 10px;color:#c8d2de;font-size:15px;line-height:1.6;">P.S. If Youzign helped you in the old days, or you like the new one, you can add a short testimonial here: <a href="${TESTIMONIAL_URL}" style="color:#0aa5f5;">${TESTIMONIAL_URL}</a></p>
        <p style="margin:0;color:#9aa7b5;font-size:14px;line-height:1.6;">Updates are automatic to spot: when a new Youzign version ships, a blue dot appears on the logo inside the app. We'll also email you when something big lands.</p>
      </div>
    </div>
  `;
}

async function addContact(email, name) {
  const response = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      first_name: name || undefined,
      unsubscribed: false
    })
  });

  if (response.ok || response.status === 409) return;

  const text = await response.text();
  if (/already exists/i.test(text)) return;
  throw new Error(`Resend contact failed: ${response.status} ${text}`);
}

async function sendDownloadEmail(email, downloads) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "Your Youzign download 🎁",
      html: emailHtml(downloads)
    })
  });

  if (!response.ok) {
    throw new Error(`Resend email failed: ${response.status} ${await response.text()}`);
  }
}

module.exports = async function subscribe(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    console.warn("Resend env vars missing; skipping subscribe email.");
    return res.status(200).json({ ok: true, emailSent: false });
  }

  try {
    const downloads = readDownloads();
    await addContact(email, name);
    await sendDownloadEmail(email, downloads);
    return res.status(200).json({ ok: true, emailSent: true });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ ok: true, emailSent: false });
  }
};
