# Youzign legacy-design claim flow

Supabase infrastructure backing the Tauri desktop app that lets old
youzign.com users find and re-download their pre-migration designs.

- **Postgres** (`migrations/0001_yz_legacy.sql`) holds design metadata and the
  raw `designstring` XML, in tables prefixed `yz_legacy_` (this is a shared
  project — the prefix keeps it isolated from unrelated apps). RLS is
  enabled on both tables with **no policies**, so only the service role
  (used exclusively by the edge function below) can read/write.
  - `yz_legacy_users` — one row per legacy user, unique on `lower(email)` and
    `lower(username)`.
  - `yz_legacy_designs` — one row per design, PK `(generation, design_id)`,
    `generation` is 1/2/3 for the three legacy design-editor eras.
- **Storage**: thumbnails and other assets live in a **private** Backblaze B2
  bucket, `youzign-archive` — not Supabase Storage. The edge function mints a
  bucket-wide B2 download-authorization token so the client can build signed
  URLs without ever seeing B2 credentials.
- **Edge function** (`functions/youzign-legacy-claim/`) is the only thing
  that talks to Postgres or B2. It's deployed with `--no-verify-jwt` because
  the desktop app has no Supabase auth session — the "identifier" (email or
  username) the user types in is the only access check.

## Deploy

```bash
# one-time secrets (never commit these)
supabase secrets set YZ_B2_KEY_ID=xxx YZ_B2_APP_KEY=xxx YZ_B2_BUCKET_ID=xxx

# deploy the function (no JWT verification — see note above)
supabase functions deploy youzign-legacy-claim --no-verify-jwt

# apply the migration
supabase db push
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` do not need to be set manually
— the Supabase edge runtime injects them automatically.

## Seed from a legacy extract

```bash
node supabase/scripts/seed-from-extracts.mjs [extract-dir]
# default extract-dir: /Users/dezygn/Projects/backup/dez73-extracts/marketing-6161/
```

Reads `user.json`, `designs_v1.json`, `designs_v2.json`, `designs_v3.json`,
`designs_v3_meta.json`, `thumbnails.json` from `extract-dir` (any of these
may be missing — the script warns and continues) and writes batched,
idempotent (`ON CONFLICT ... DO UPDATE`) SQL files to
`<extract-dir>/seed/001.sql`, `002.sql`, ... (each kept under 400 KB). Run
the generated files against the project with `psql` or
`supabase db execute -f <file>`, in order.

## API — `youzign-legacy-claim`

POST a JSON body with an `action` field. CORS is wide open (`*`) since the
desktop app runs from `tauri://localhost` / `http://localhost:1420` /
`http://localhost:5191`, none of which are meaningfully "an origin" to lock
down.

### `{"action": "lookup", "identifier": "someone@example.com"}`

Matches `identifier` case-insensitively against email or username.

```jsonc
// 200
{
  "user": { "user_id": 6161, "username": "MarketingUser", "email_masked": "m*****r@e***.com" },
  "designs": [
    {
      "generation": 3, "design_id": 301, "title": "Product Launch Deck",
      "created_at": "2019-08-01T00:00:00.000Z", "updated_at": "2019-08-05T00:00:00.000Z",
      "thumb_url": "https://f000.backblazeb2.com/file/youzign-archive/wp-content/uploads/2019/08/deck.png?Authorization=..."
    }
  ],
  "download": { "base_url": "https://f000.backblazeb2.com/file/youzign-archive", "token": "...", "expires_at": "2026-07-21T..." }
}
// 404 { "error": "not_found" }
```

`designstring` is never included in `lookup` — metadata only.

### `{"action": "get_design", "identifier": "...", "generation": 3, "design_id": 301}`

Verifies the design belongs to the user resolved from `identifier`.

```jsonc
// 200
{ "designstring": "<design>...</design>", "download": { "base_url": "...", "token": "...", "expires_at": "..." } }
// 403 { "error": "forbidden" }   — design exists but belongs to a different user
// 404 { "error": "design_not_found" } / { "error": "not_found" }
```

`download.token` is a B2 bucket-wide download-authorization token, valid 7
days, cached and reused server-side until <24h from expiry. Append it as
`?Authorization=<token>` to any `<base_url>/<key>` to fetch a private file.
