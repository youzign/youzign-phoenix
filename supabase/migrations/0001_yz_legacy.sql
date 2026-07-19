-- Youzign legacy-design claim flow: schema for imported legacy user + design
-- metadata. Everything is prefixed yz_legacy because this lives on a shared
-- Supabase project alongside unrelated apps.
--
-- Access model: RLS is enabled on both tables with NO policies defined, so
-- only the service role (used exclusively by the youzign-legacy-claim edge
-- function) can read/write. Anonymous/authenticated roles get nothing.

-- ---------------------------------------------------------------------------
-- yz_legacy_users
-- ---------------------------------------------------------------------------

create table if not exists public.yz_legacy_users (
  user_id      bigint primary key,
  username     text not null,
  email        text not null,
  registered   timestamptz,
  designs_v1   int not null default 0,
  designs_v2   int not null default 0,
  designs_v3   int not null default 0
);

create unique index if not exists yz_legacy_users_email_lower_idx
  on public.yz_legacy_users (lower(email));

create unique index if not exists yz_legacy_users_username_lower_idx
  on public.yz_legacy_users (lower(username));

alter table public.yz_legacy_users enable row level security;

-- ---------------------------------------------------------------------------
-- yz_legacy_designs
-- ---------------------------------------------------------------------------

create table if not exists public.yz_legacy_designs (
  generation   smallint not null check (generation in (1, 2, 3)),
  design_id    bigint not null,
  user_id      bigint not null,
  title        text,
  created_at   timestamptz,
  updated_at   timestamptz,
  thumb_key    text,
  designstring text,
  primary key (generation, design_id)
);

create index if not exists yz_legacy_designs_user_id_idx
  on public.yz_legacy_designs (user_id);

alter table public.yz_legacy_designs enable row level security;
