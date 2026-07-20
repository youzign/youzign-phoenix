-- Full-corpus seeding (DEZ-73). The per-design table does not scale to the
-- real corpus: 2,253,846 v3 designs would occupy ~450-480 MB with indexes,
-- against Supabase's 500 MB free-tier ceiling, leaving no headroom.
--
-- Only 32,337 users own any v3 design, so we invert the layout: one row per
-- OWNER holding their whole design list as jsonb. Postgres TOAST-compresses
-- those blobs, landing the corpus at roughly 65-150 MB instead. The design
-- XML itself (14.4 GB) never enters Postgres — it is served from Backblaze
-- on demand, which was already the plan of record.
--
-- yz_legacy_designs is kept for the already-seeded test accounts and the
-- small v1/v2 sets; the edge function prefers a manifest when one exists.

create table if not exists public.yz_legacy_manifests (
  user_id      bigint primary key,
  design_count int not null default 0,
  -- array of {g,i,t,c,m,f,k}: generation, design_id, title, created,
  -- modified, format ('xml'|'json'), thumb key. Keys are single letters
  -- deliberately — at ~2.25M entries the key names themselves are payload.
  designs      jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.yz_legacy_manifests enable row level security;

-- No policies: service role only, matching yz_legacy_users/_designs. The
-- edge function is the sole reader.

comment on table public.yz_legacy_manifests is
  'One row per legacy user that owns designs. Replaces per-design rows for the full corpus so the project stays inside the Supabase free tier.';
