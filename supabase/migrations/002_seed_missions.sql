-- =============================================================================
-- 002_seed_missions.sql
-- Ethical CyberHackers — seed the three shipped mission catalog rows
-- -----------------------------------------------------------------------------
-- PURPOSE
--   The browser sync layer needs a `mission_id` UUID to write `mission_attempts`
--   and `student_progress`. This migration inserts the three missions so that
--   FK lookups (`SELECT id FROM missions WHERE mission_code = 'mission-001'`)
--   succeed.
--
-- SAFETY
--   Idempotent: INSERT ... ON CONFLICT (mission_code) DO NOTHING.
--   Re-running never overwrites existing rows or loses data.
-- =============================================================================

insert into public.missions
  (mission_code, title, description, difficulty, mission_order, xp_reward,
   tier_level, role_track, is_active, unlock_requirements)
values
  (
    'mission-001',
    'New Cybersecurity Intern',
    'A workstation on the internal network has been flagged for anomalous activity. '
      'Use basic Linux-style investigation commands to inspect the user''s files, '
      'identify the threat, and report your finding.',
    'beginner',
    1,
    250,
    1,
    'blue-team',
    true,
    '{}'::jsonb
  ),
  (
    'mission-002',
    'Network Basics',
    'Run a short series of network commands against a target host. Identify the '
      'open services, then complete an analyst review and a final assessment to '
      'confirm your understanding.',
    'beginner',
    2,
    300,
    1,
    'blue-team',
    true,
    '{"requires": ["mission-001"]}'::jsonb
  ),
  (
    'mission-003',
    'Reconnaissance Detection',
    'Detect and report external reconnaissance activity against the network. '
      'Use connection logs, IP analysis, and service probing signatures to '
      'identify an attacker''s early-stage information-gathering.',
    'beginner',
    3,
    100,
    2,
    'blue-team',
    true,
    '{"requires": ["mission-002"]}'::jsonb
  )
on conflict (mission_code) do nothing;

-- =============================================================================
-- END 002_seed_missions.sql
-- =============================================================================
