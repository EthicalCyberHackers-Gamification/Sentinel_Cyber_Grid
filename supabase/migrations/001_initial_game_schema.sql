-- =============================================================================
-- 001_initial_game_schema.sql
-- Ethical CyberHackers — initial production game schema
-- -----------------------------------------------------------------------------
-- PURPOSE
--   Real PostgreSQL/Supabase schema backing the cybersecurity training platform.
--   The game itself remains LOCAL-FIRST (browser localStorage is authoritative);
--   these tables are the durable cloud mirror + progression/analytics backbone
--   that the sync layer writes into.
--
-- SAFETY
--   * Additive and idempotent — safe to re-run. Uses `create ... if not exists`,
--     `create or replace function/trigger`, and `drop policy if exists` guards.
--   * Never drops/truncates/destroys existing tables or data.
--   * Designed to grow: anonymous players now, authenticated accounts later,
--     role tracks, certificates, classrooms/teams — without a redesign.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Extensions (safe to re-run)
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid(), gen_random_bytes()

-- ----------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. profiles  — persistent player identity & career progression
--    Supports anonymous players now (anonymous_id) and authenticated users
--    later (user_id -> auth.users).
-- =============================================================================
create table if not exists public.profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references auth.users (id) on delete cascade,
  anonymous_id        text unique,
  display_name        text,
  current_role        text not null default 'Cybersecurity Intern',
  xp_total            integer not null default 0,
  trust_score         integer not null default 0,
  analyst_reputation  text,
  promotion_readiness integer not null default 0,
  missions_completed  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'Persistent player identity & career progression. anonymous_id for local-first players; user_id links a future authenticated account.';
comment on column public.profiles.current_role is
  'Role-track label: Cybersecurity Intern, Junior SOC Analyst, SOC Analyst, Threat Hunter, Incident Responder, Red Team Operator, Security Engineer.';
comment on column public.profiles.analyst_reputation is
  'Derived reputation tier label (mirrors the in-game reputation rendering).';
comment on column public.profiles.promotion_readiness is
  'Promotion readiness as a 0-100 percentage.';

create index if not exists idx_profiles_anonymous_id on public.profiles (anonymous_id);
create index if not exists idx_profiles_current_role  on public.profiles (current_role);
create index if not exists idx_profiles_created_at     on public.profiles (created_at);

-- =============================================================================
-- 2. missions  — mission metadata & progression structure
--    Read-mostly catalog driving campaign/role progression and branching trees.
-- =============================================================================
create table if not exists public.missions (
  id                         uuid primary key default gen_random_uuid(),
  mission_code               text unique not null,
  title                      text not null,
  description                text,
  tier_level                 integer,
  role_track                 text,
  difficulty                 text,
  mission_order              integer,
  xp_reward                  integer not null default 0,
  unlock_requirements        jsonb not null default '{}'::jsonb,
  estimated_duration_minutes integer,
  is_active                  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table public.missions is
  'Mission metadata & progression structure. mission_code is the stable external id (e.g. mission-001). unlock_requirements (jsonb) supports branching campaign trees.';

create index if not exists idx_missions_mission_code  on public.missions (mission_code);
create index if not exists idx_missions_role_track     on public.missions (role_track);
create index if not exists idx_missions_mission_order  on public.missions (mission_order);
create index if not exists idx_missions_created_at      on public.missions (created_at);

-- =============================================================================
-- 3. student_progress  — CURRENT / BEST progression state (NOT full history)
--    Exactly one row per (profile, mission).
-- =============================================================================
create table if not exists public.student_progress (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  mission_id        uuid not null references public.missions (id) on delete cascade,
  status            text not null default 'not_started',
  best_score        integer,
  best_confidence   integer,
  best_trust_delta  integer,
  attempts_count    integer not null default 0,
  highest_xp_earned integer not null default 0,
  completed_at      timestamptz,
  last_played_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (profile_id, mission_id)
);

comment on table public.student_progress is
  'Best/current progression per (profile, mission). Historical attempts live in mission_attempts; this table is overwritten in place.';
comment on column public.student_progress.status is
  'not_started | in_progress | completed (free-form text to allow future states).';

create index if not exists idx_student_progress_profile_id   on public.student_progress (profile_id);
create index if not exists idx_student_progress_mission_id    on public.student_progress (mission_id);
create index if not exists idx_student_progress_status        on public.student_progress (status);
create index if not exists idx_student_progress_completed_at  on public.student_progress (completed_at);

-- =============================================================================
-- 4. mission_attempts  — IMMUTABLE historical replay records
--    Each replay inserts a NEW row; rows are never overwritten.
-- =============================================================================
create table if not exists public.mission_attempts (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  mission_id         uuid not null references public.missions (id) on delete cascade,
  attempt_number     integer not null,
  outcome_status     text,
  xp_earned          integer not null default 0,
  trust_delta        integer not null default 0,
  analyst_confidence integer,
  containment_score  integer,
  evidence_score     integer,
  reasoning_score    integer,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  scorecard_json     jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

comment on table public.mission_attempts is
  'Immutable, append-only replay log. One row per attempt; never updated/overwritten. scorecard_json holds the full attempt scorecard.';

create index if not exists idx_mission_attempts_profile_id  on public.mission_attempts (profile_id);
create index if not exists idx_mission_attempts_mission_id   on public.mission_attempts (mission_id);
create index if not exists idx_mission_attempts_created_at    on public.mission_attempts (created_at);
create index if not exists idx_mission_attempts_completed_at  on public.mission_attempts (completed_at);
create index if not exists idx_mission_attempts_profile_mission
  on public.mission_attempts (profile_id, mission_id);

-- =============================================================================
-- 5. xp_events  — XP / reputation history (audit trail)
-- =============================================================================
create table if not exists public.xp_events (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  mission_attempt_id uuid references public.mission_attempts (id) on delete set null,
  event_type        text not null,
  xp_change         integer not null default 0,
  trust_change      integer not null default 0,
  description       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.xp_events is
  'XP/reputation history. event_type e.g. mission_completion, reasoning_success, threat_containment, evidence_correlation, bonus_objective.';

create index if not exists idx_xp_events_profile_id        on public.xp_events (profile_id);
create index if not exists idx_xp_events_mission_attempt_id on public.xp_events (mission_attempt_id);
create index if not exists idx_xp_events_event_type         on public.xp_events (event_type);
create index if not exists idx_xp_events_created_at          on public.xp_events (created_at);

-- =============================================================================
-- 6. certificates  — earned certifications / completions
-- =============================================================================
create table if not exists public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  certificate_code   text not null,
  title              text,
  issued_at          timestamptz not null default now(),
  expiration_date    timestamptz,
  verification_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

comment on table public.certificates is
  'Earned certificates/completions. verification_token (unique) backs future downloadable certs & school verification systems.';

create index if not exists idx_certificates_profile_id  on public.certificates (profile_id);
create index if not exists idx_certificates_created_at    on public.certificates (created_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers (idempotent via CREATE OR REPLACE TRIGGER, PG14+/Supabase)
-- Applied to mutable tables only. mission_attempts/xp_events/certificates are
-- append-only/immutable and intentionally have no updated_at.
-- ----------------------------------------------------------------------------
create or replace trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace trigger trg_missions_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

create or replace trigger trg_student_progress_updated_at
  before update on public.student_progress
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- Secure-by-default: RLS is ENABLED on every table, so nothing is reachable
-- unless a policy allows it. Policies below are STARTER policies that unblock the
-- current local-first / anonymous phase while leaving a clear, documented path to
-- per-user lockdown once authentication ships. They are deliberately NOT a blanket
-- "anon can do anything" rule:
--   * No anonymous UPDATE or DELETE anywhere — an anon client can create and read
--     rows but CANNOT modify or remove existing rows (no cross-row tampering).
--   * The missions catalog is read-only for clients (seeded via the service role).
--   * The ledgers (mission_attempts, xp_events, certificates) are append-only.
-- Mutating existing rows (e.g. updating best/current progress or profile totals)
-- is intentionally reserved for the authenticated owner path below (auth.uid()),
-- or for a trusted service-role process. Do NOT add a blanket anon UPDATE — when
-- the sync layer is pointed at this schema, route mutations through auth, an
-- upsert behind a scoped policy, or the service role.
-- (Anon SELECT is permissive by necessity — there is no anon identity to scope by —
-- but the data in this phase is anonymous, non-PII training telemetry.)
--
-- Migration path to full auth lockdown (do this when auth.users-backed accounts
-- arrive): drop the `*_anon_*` policies below and rely on the `*_auth_owner`
-- policies, which already scope every row to the signed-in user via auth.uid().
-- =============================================================================
alter table public.profiles         enable row level security;
alter table public.missions         enable row level security;
alter table public.student_progress enable row level security;
alter table public.mission_attempts enable row level security;
alter table public.xp_events        enable row level security;
alter table public.certificates     enable row level security;

-- ---- missions: public read-only catalog --------------------------------------
drop policy if exists missions_read_all on public.missions;
create policy missions_read_all
  on public.missions for select
  to anon, authenticated
  using (true);
-- (No client INSERT/UPDATE/DELETE: missions are seeded/managed via service role.)

-- ---- profiles ---------------------------------------------------------------
-- Authenticated owner: full control over the row linked to their auth user.
drop policy if exists profiles_auth_owner on public.profiles;
create policy profiles_auth_owner
  on public.profiles for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Anonymous (local-first) starter: read + create only. NO update, NO delete —
-- an anon client cannot mutate existing rows (prevents cross-row tampering). Row
-- mutation is reserved for the authenticated owner path / service role.
-- (Drop the explicit anon UPDATE here on purpose; do not re-add a blanket one.)
drop policy if exists profiles_anon_update on public.profiles;  -- defensive: remove any prior broad anon UPDATE

drop policy if exists profiles_anon_read on public.profiles;
create policy profiles_anon_read
  on public.profiles for select to anon using (true);

drop policy if exists profiles_anon_insert on public.profiles;
create policy profiles_anon_insert
  on public.profiles for insert to anon with check (true);

-- ---- helper: child-row ownership for the authenticated user ------------------
-- A child row belongs to the user if its profile_id maps to the user's profile.

-- ---- student_progress -------------------------------------------------------
drop policy if exists student_progress_auth_owner on public.student_progress;
create policy student_progress_auth_owner
  on public.student_progress for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = student_progress.profile_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = student_progress.profile_id and p.user_id = auth.uid()
    )
  );

-- Anonymous: read + create only. NO update/delete (mutate via auth owner / service role).
drop policy if exists student_progress_anon_update on public.student_progress;  -- defensive: remove any prior broad anon UPDATE
drop policy if exists student_progress_anon_rw on public.student_progress;
create policy student_progress_anon_rw
  on public.student_progress for select to anon using (true);
drop policy if exists student_progress_anon_insert on public.student_progress;
create policy student_progress_anon_insert
  on public.student_progress for insert to anon with check (true);

-- ---- mission_attempts (append-only: insert + read, never update/delete) ------
drop policy if exists mission_attempts_auth_owner on public.mission_attempts;
create policy mission_attempts_auth_owner
  on public.mission_attempts for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = mission_attempts.profile_id and p.user_id = auth.uid()
    )
  );
drop policy if exists mission_attempts_auth_insert on public.mission_attempts;
create policy mission_attempts_auth_insert
  on public.mission_attempts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = mission_attempts.profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists mission_attempts_anon_read on public.mission_attempts;
create policy mission_attempts_anon_read
  on public.mission_attempts for select to anon using (true);
drop policy if exists mission_attempts_anon_insert on public.mission_attempts;
create policy mission_attempts_anon_insert
  on public.mission_attempts for insert to anon with check (true);

-- ---- xp_events (append-only: insert + read) ---------------------------------
drop policy if exists xp_events_auth_owner on public.xp_events;
create policy xp_events_auth_owner
  on public.xp_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = xp_events.profile_id and p.user_id = auth.uid()
    )
  );
drop policy if exists xp_events_auth_insert on public.xp_events;
create policy xp_events_auth_insert
  on public.xp_events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = xp_events.profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists xp_events_anon_read on public.xp_events;
create policy xp_events_anon_read
  on public.xp_events for select to anon using (true);
drop policy if exists xp_events_anon_insert on public.xp_events;
create policy xp_events_anon_insert
  on public.xp_events for insert to anon with check (true);

-- ---- certificates (insert + read) -------------------------------------------
drop policy if exists certificates_auth_owner on public.certificates;
create policy certificates_auth_owner
  on public.certificates for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = certificates.profile_id and p.user_id = auth.uid()
    )
  );
drop policy if exists certificates_auth_insert on public.certificates;
create policy certificates_auth_insert
  on public.certificates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = certificates.profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists certificates_anon_read on public.certificates;
create policy certificates_anon_read
  on public.certificates for select to anon using (true);
drop policy if exists certificates_anon_insert on public.certificates;
create policy certificates_anon_insert
  on public.certificates for insert to anon with check (true);

-- =============================================================================
-- END 001_initial_game_schema.sql
-- =============================================================================
