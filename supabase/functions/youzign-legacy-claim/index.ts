// youzign-legacy-claim
//
// Lets a legacy youzign.com user (pre-migration) find their old designs by
// email or username, then fetch a single design's designstring XML. Assets
// (thumbnails, and whatever the desktop app renders from designstring) live
// in a PRIVATE Backblaze B2 bucket ("youzign-archive"); this function mints a
// bucket-scoped B2 download-authorization token so the client can build
// signed URLs without ever touching B2 credentials directly.
//
// Deployed with --no-verify-jwt (see ../../README.md). All access control is
// the identifier match performed here plus RLS-locked service-role access to
// Postgres — there is no separate auth layer.
//
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_HEADERS = "content-type, authorization, apikey, x-client-info";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
}

function jsonError(status: number, error: string): Response {
  return jsonResponse(status, { error });
}

// ---------------------------------------------------------------------------
// Supabase client (service role — never expose this key to the client app)
// ---------------------------------------------------------------------------

let supabaseClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("supabase_env_missing");
  }
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

// ---------------------------------------------------------------------------
// B2 download-authorization token (bucket-wide, cached across invocations)
// ---------------------------------------------------------------------------

const B2_BUCKET_NAME = "youzign-archive";
const B2_TOKEN_VALID_SECONDS = 604800; // 7 days
const B2_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000; // refresh when <24h from expiry

interface B2Auth {
  token: string;
  baseUrl: string;
  expiresAt: number; // epoch ms
}

let cachedB2Auth: B2Auth | null = null;

async function getB2Auth(): Promise<B2Auth> {
  const now = Date.now();
  if (cachedB2Auth && cachedB2Auth.expiresAt - now > B2_REFRESH_MARGIN_MS) {
    return cachedB2Auth;
  }

  const keyId = Deno.env.get("YZ_B2_KEY_ID");
  const appKey = Deno.env.get("YZ_B2_APP_KEY");
  const bucketId = Deno.env.get("YZ_B2_BUCKET_ID");
  if (!keyId || !appKey || !bucketId) {
    throw new Error("b2_env_missing");
  }

  const authRes = await fetch(
    "https://api.backblazeb2.com/b2api/v3/b2_authorize_account",
    {
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${appKey}`)}`,
      },
    },
  );
  if (!authRes.ok) {
    throw new Error(`b2_authorize_failed:${authRes.status}`);
  }
  const authJson: any = await authRes.json();

  // v3 shape: { authorizationToken, apiInfo: { storageApi: { apiUrl, downloadUrl } } }
  // Fall back to top-level fields in case B2 changes/flattens the shape.
  const storageApi = authJson?.apiInfo?.storageApi ?? {};
  const apiUrl: string | undefined = storageApi.apiUrl ?? authJson.apiUrl;
  const downloadUrl: string | undefined = storageApi.downloadUrl ?? authJson.downloadUrl;
  const accountAuthToken: string | undefined = authJson.authorizationToken;

  if (!apiUrl || !downloadUrl || !accountAuthToken) {
    throw new Error("b2_authorize_malformed_response");
  }

  const dlAuthRes = await fetch(
    `${apiUrl}/b2api/v3/b2_get_download_authorization`,
    {
      method: "POST",
      headers: {
        Authorization: accountAuthToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bucketId,
        fileNamePrefix: "",
        validDurationInSeconds: B2_TOKEN_VALID_SECONDS,
      }),
    },
  );
  if (!dlAuthRes.ok) {
    throw new Error(`b2_get_download_authorization_failed:${dlAuthRes.status}`);
  }
  const dlJson: any = await dlAuthRes.json();
  const token: string | undefined = dlJson.authorizationToken;
  if (!token) {
    throw new Error("b2_get_download_authorization_malformed_response");
  }

  cachedB2Auth = {
    token,
    baseUrl: `${downloadUrl}/file/${B2_BUCKET_NAME}`,
    expiresAt: now + B2_TOKEN_VALID_SECONDS * 1000,
  };
  return cachedB2Auth;
}

function downloadPayload(b2: B2Auth) {
  return {
    base_url: b2.baseUrl,
    token: b2.token,
    expires_at: new Date(b2.expiresAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape ILIKE special characters so a plain identifier is matched literally
 * (case-insensitively), never as a wildcard pattern. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const localMasked = local.length <= 2
    ? `${local[0] ?? "*"}*`
    : `${local[0]}*****${local[local.length - 1]}`;

  const dot = domain.lastIndexOf(".");
  const domainMasked = dot > 0
    ? `${domain[0]}***${domain.slice(dot)}`
    : `${domain[0] ?? "*"}***`;

  return `${localMasked}@${domainMasked}`;
}

interface LegacyUserRow {
  user_id: number;
  username: string;
  email: string;
  registered: string | null;
  designs_v1: number;
  designs_v2: number;
  designs_v3: number;
}

async function findUserByIdentifier(
  supabase: SupabaseClient,
  identifier: string,
): Promise<LegacyUserRow | null> {
  const pattern = escapeLike(identifier);

  const byEmail = await supabase
    .from("yz_legacy_users")
    .select("*")
    .ilike("email", pattern)
    .maybeSingle();
  if (byEmail.error) throw byEmail.error;
  if (byEmail.data) return byEmail.data as LegacyUserRow;

  const byUsername = await supabase
    .from("yz_legacy_users")
    .select("*")
    .ilike("username", pattern)
    .maybeSingle();
  if (byUsername.error) throw byUsername.error;
  return (byUsername.data as LegacyUserRow) ?? null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleLookup(body: any): Promise<Response> {
  const identifier = String(body?.identifier ?? "").trim().toLowerCase();
  if (!identifier) return jsonError(400, "missing_identifier");

  const supabase = getClient();
  const user = await findUserByIdentifier(supabase, identifier);
  if (!user) return jsonError(404, "not_found");

  // PostgREST caps a single select at 1000 rows — page through with .range()
  // so users with more designs than that (e.g. the 1,360-design test account)
  // get their full list.
  const PAGE = 1000;
  const designs: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: designsError } = await supabase
      .from("yz_legacy_designs")
      .select("generation, design_id, title, created_at, updated_at, thumb_key, format")
      .eq("user_id", user.user_id)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("design_id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (designsError) throw designsError;
    designs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const b2 = await getB2Auth();

  const designsOut = (designs ?? []).map((d: any) => ({
    generation: d.generation,
    design_id: d.design_id,
    title: d.title,
    format: d.format ?? "xml",
    created_at: d.created_at,
    updated_at: d.updated_at,
    thumb_url: d.thumb_key
      ? `${b2.baseUrl}/${d.thumb_key}?Authorization=${b2.token}`
      : null,
  }));

  return jsonResponse(200, {
    user: {
      user_id: user.user_id,
      username: user.username,
      email_masked: maskEmail(user.email),
    },
    designs: designsOut,
    download: downloadPayload(b2),
  });
}

async function handleGetDesign(body: any): Promise<Response> {
  const identifier = String(body?.identifier ?? "").trim().toLowerCase();
  const generation = Number(body?.generation);
  const designIdRaw = body?.design_id;

  if (!identifier) return jsonError(400, "missing_identifier");
  if (![1, 2, 3].includes(generation)) return jsonError(400, "invalid_generation");
  if (designIdRaw === undefined || designIdRaw === null || designIdRaw === "") {
    return jsonError(400, "missing_design_id");
  }

  const supabase = getClient();
  const user = await findUserByIdentifier(supabase, identifier);
  if (!user) return jsonError(404, "not_found");

  const { data: design, error } = await supabase
    .from("yz_legacy_designs")
    .select("generation, design_id, user_id, designstring")
    .eq("generation", generation)
    .eq("design_id", designIdRaw)
    .maybeSingle();
  if (error) throw error;
  if (!design) return jsonError(404, "design_not_found");

  if (String((design as any).user_id) !== String(user.user_id)) {
    return jsonError(403, "forbidden");
  }

  const b2 = await getB2Auth();

  return jsonResponse(200, {
    designstring: (design as any).designstring,
    download: downloadPayload(b2),
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  const action = body?.action;

  try {
    if (action === "lookup") return await handleLookup(body);
    if (action === "get_design") return await handleGetDesign(body);
    return jsonError(400, "unknown_action");
  } catch (err) {
    // Never leak stack traces / internals to the client.
    console.error("youzign-legacy-claim error:", err);
    return jsonError(500, "internal_error");
  }
});
