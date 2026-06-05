-- =============================================================================
-- 004_progress_snapshots.sql
-- Ethical CyberHackers — faithful full-progress cloud restore checkpoints
-- -----------------------------------------------------------------------------
-- PURPOSE
--   Phase 3B adds a durable cloud RESTORE path. The normalized tables
--   (profiles / student_progress / mission_attempts / xp_events) are an
--   analytics/audit mirror and cannot faithfully reconstruct the authoritative
--   local save (different XP number-space; rich in-mission state — evidence
--   pins, confidence/reasoning, blue-team/incident state — is not modeled).
--
--   This table stores the FULL authoritative progress blob (the same object
--   written to localStorage `ech.progress.v1`) as an append-only checkpoint, so
--   restore brings everything back exactly. localStorage stays authoritative;
--   these are best-effort durable checkpoints and the foundation for future
--   authentication / cross-device continuity.
--
-- SECURITY (mirrors the append-only ledger model)
--   RLS enabled. anon may INSERT + SELECT only (immutable checkpoints — no
--   UPDATE/DELETE, so the server never needs to grant anon mutation). When auth
--   ships, the owner-scoped policies already restrict access via profiles.user_id;
--   drop the *_anon_* policies to lock down with no schema change.
--
-- SAFETY
--   Additive + idempotent (create ... if not exists, drop policy if exists +
--   create policy). Never drops or truncates tables or data.
-- =============================================================================

create table if not exists public.progress_snapshots (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  schema_version  text not null default 'ech.progress.v1',
  snapshot_json   jsonb not null,
  client_saved_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Fast "latest snapshot for this profile" lookup.
create index if not exists idx_progress_snapshots_profile_latest
  on public.progress_snapshots (profile_id, client_saved_at desc);

alter table public.progress_snapshots enable row level security;

-- anon: append-only (insert) + read. No update/delete (immutable checkpoints).
drop policy if exists progress_snapshots_anon_insert on public.progress_snapshots;
create policy progress_snapshots_anon_insert
  on public.progress_snapshots for insert to anon with check (true);

drop policy if exists progress_snapshots_anon_read on public.progress_snapshots;
create policy progress_snapshots_anon_read
  on public.progress_snapshots for select to anon using (true);

-- authenticated: owner-scoped via profiles.user_id (lockdown path when auth ships).
drop policy if exists progress_snapshots_auth_insert on public.progress_snapshots;
create policy progress_snapshots_auth_insert
  on public.progress_snapshots for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = progress_snapshots.profile_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists progress_snapshots_auth_owner on public.progress_snapshots;
create policy progress_snapshots_auth_owner
  on public.progress_snapshots for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = progress_snapshots.profile_id
        and p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- END 004_progress_snapshots.sql
-- =============================================================================
