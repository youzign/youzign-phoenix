#!/usr/bin/env node
// One-shot Resend setup for the Youzign download funnel.
// Usage: RESEND_API_KEY=re_... node landing/scripts/resend-setup.mjs
//
// Creates the "Youzign Downloads" audience (idempotent: reuses if it exists),
// registers youzign.com as a sending domain, and prints the DNS records to
// add at GoDaddy plus the two env vars to set on the Vercel project.

const KEY = process.env.RESEND_API_KEY;
if (!KEY) {
  console.error("RESEND_API_KEY is not set. Run: RESEND_API_KEY=re_... node landing/scripts/resend-setup.mjs");
  process.exit(1);
}

const api = async (method, path, body) => {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
};

// 1. Audience
const AUDIENCE_NAME = "Youzign Downloads";
const audiences = await api("GET", "/audiences");
let audience = (audiences.data || []).find((a) => a.name === AUDIENCE_NAME);
if (audience) {
  console.log(`Audience exists: "${AUDIENCE_NAME}" -> ${audience.id}`);
} else {
  audience = await api("POST", "/audiences", { name: AUDIENCE_NAME });
  console.log(`Audience created: "${AUDIENCE_NAME}" -> ${audience.id}`);
}

// 2. Sending domain (updates.youzign.com keeps the root domain's mail reputation separate)
const DOMAIN = process.env.RESEND_DOMAIN || "updates.youzign.com";
const domains = await api("GET", "/domains");
let domain = (domains.data || []).find((d) => d.name === DOMAIN);
if (domain) {
  console.log(`Domain exists: ${DOMAIN} -> ${domain.id} (status: ${domain.status})`);
} else {
  domain = await api("POST", "/domains", { name: DOMAIN });
  console.log(`Domain registered: ${DOMAIN} -> ${domain.id}`);
}
const full = await api("GET", `/domains/${domain.id}`);

console.log("\n=== DNS records to add at GoDaddy (youzign.com zone) ===");
for (const r of full.records || []) {
  console.log(`  ${r.record ?? r.type}\t${r.type}\tname: ${r.name}\tvalue: ${r.value}` + (r.priority != null ? `\tpriority: ${r.priority}` : ""));
}
console.log(`\nThen click Verify in Resend (or: curl -X POST https://api.resend.com/domains/${domain.id}/verify -H 'Authorization: Bearer $RESEND_API_KEY')`);

console.log("\n=== Vercel env vars (project youzign-landing, all environments) ===");
console.log(`  RESEND_API_KEY      = <the key you just used>`);
console.log(`  RESEND_AUDIENCE_ID  = ${audience.id}`);
console.log("\nSet them with:");
console.log("  cd landing && vercel env add RESEND_API_KEY production && vercel env add RESEND_AUDIENCE_ID production");
console.log("  (repeat for preview so the preview-deploy e2e test works)");
