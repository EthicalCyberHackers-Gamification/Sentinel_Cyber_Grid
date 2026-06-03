-- =============================================================================
-- 003_server_triggers.sql
-- Ethical CyberHackers — server-side triggers to maintain denormalised totals
-- -----------------------------------------------------------------------------
-- PURPOSE
--   The browser client uses ONLY the `anon` key, which has INSERT but NOT UPDATE
--   permission on `profiles` and `student_progress`. These server-side trigger
--   functions run with SECURITY DEFINER (i.e. with the postgres role) so they can
--   UPDATE those rows in response to client INSERTs — no RLS change needed.
--
--   Trigger A  (after INSERT on mission_attempts)
--     → upserts the corresponding `student_progress` row (best score, confidence,
--       attempts count, status, completed_at).
--     → increments `profiles.missions_completed` when outcome_status = 'completed'.
--
--   Trigger B  (after INSERT on xp_events)
--     → increments `profiles.xp_total` and `profiles.trust_score` by the event's
--       xp_change / trust_change columns.
--
-- SAFETY
--   Both trigger functions are idempotent via CREATE OR REPLACE.
--   Triggers are idempotent via CREATE OR REPLACE TRIGGER (PG14+ / Supabase).
--   Nothing in this migration drops or truncates tables or data.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Trigger A — maintain student_progress + profiles.missions_completed
--             fires AFTER INSERT on mission_attempts
-- ---------------------------------------------------------------------------

create or replace function public.trg_fn_mission_attempt_upsert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status          text;
  v_completed_at    timestamptz;
begin
  -- Determine the aggregated status for this (profile, mission) pair.
  -- Once any attempt is 'completed' the progress row stays 'completed'.
  select
    case
      when bool_or(outcome_status = 'completed') then 'completed'
      else 'in_progress'
    end,
    max(case when outcome_status = 'completed' then completed_at end)
  into v_status, v_completed_at
  from public.mission_attempts
  where profile_id = new.profile_id
    and mission_id  = new.mission_id;

  -- Upsert the student_progress row (one per profile × mission).
  insert into public.student_progress
    (profile_id, mission_id, status,
     best_score, best_confidence, best_trust_delta,
     attempts_count, highest_xp_earned,
     completed_at, last_played_at)
  values (
    new.profile_id,
    new.mission_id,
    coalesce(v_status, 'in_progress'),
    new.analyst_confidence,
    new.analyst_confidence,
    new.trust_delta,
    1,
    new.xp_earned,
    v_completed_at,
    now()
  )
  on conflict (profile_id, mission_id) do update set
    status           = excluded.status,
    best_score       = greatest(coalesce(student_progress.best_score, 0),
                                coalesce(excluded.best_score, 0)),
    best_confidence  = greatest(coalesce(student_progress.best_confidence, 0),
                                coalesce(excluded.best_confidence, 0)),
    best_trust_delta = greatest(coalesce(student_progress.best_trust_delta, 0),
                                coalesce(excluded.best_trust_delta, 0)),
    attempts_count   = student_progress.attempts_count + 1,
    highest_xp_earned= greatest(coalesce(student_progress.highest_xp_earned, 0),
                                coalesce(excluded.highest_xp_earned, 0)),
    completed_at     = coalesce(student_progress.completed_at, excluded.completed_at),
    last_played_at   = now(),
    updated_at       = now();

  -- Increment profiles.missions_completed when this is a completing attempt.
  if new.outcome_status = 'completed' then
    update public.profiles
    set
      missions_completed = missions_completed + 1,
      updated_at         = now()
    where id = new.profile_id
      and not exists (
        -- only count the FIRST completion for this (profile, mission) pair
        select 1
        from public.mission_attempts
        where profile_id     = new.profile_id
          and mission_id      = new.mission_id
          and outcome_status  = 'completed'
          and id             <> new.id
      );
  end if;

  return new;
end;
$$;

create or replace trigger trg_mission_attempt_upsert
  after insert on public.mission_attempts
  for each row execute function public.trg_fn_mission_attempt_upsert();


-- ---------------------------------------------------------------------------
-- Trigger B — maintain profiles.xp_total and profiles.trust_score
--             fires AFTER INSERT on xp_events
-- ---------------------------------------------------------------------------

create or replace function public.trg_fn_xp_event_rollup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
  set
    xp_total    = xp_total    + coalesce(new.xp_change,    0),
    trust_score = trust_score + coalesce(new.trust_change, 0),
    updated_at  = now()
  where id = new.profile_id;

  return new;
end;
$$;

create or replace trigger trg_xp_event_rollup
  after insert on public.xp_events
  for each row execute function public.trg_fn_xp_event_rollup();


-- =============================================================================
-- END 003_server_triggers.sql
-- =============================================================================
