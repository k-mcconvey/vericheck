-- VeriCheck schema
-- Run in Supabase SQL Editor in order: 01_schema.sql → 02_rls.sql → 03_seed.sql

-- ── items ─────────────────────────────────────────────────────────────────────
-- Seeded from veriscan_manifest.json. Answer fields are server-only.
create table if not exists public.items (
  id                integer primary key,
  image_filename    text not null,
  phase             text not null,            -- '1' | '2' | 'exclude'
  type              text not null,            -- 'image' | 'document'
  family            text not null,
  case_context      text not null,
  stakes_tag        text not null,            -- 'civil' | 'criminal' | 'administrative'
  -- SERVER-ONLY answer fields (never sent to browser):
  ground_truth      text not null,            -- 'authentic' | 'manipulated'
  veriscan_score    double precision not null, -- 0–1
  detector_regime   text not null,            -- 'confident_correct' | 'uncertain' | 'confident_error'
  -- Part 2 only (null for phase-1 items):
  p2_metadata       text,
  p2_explanation    text,
  p2_limitations    text
);

-- ── participants ──────────────────────────────────────────────────────────────
create table if not exists public.participants (
  participant_code  text primary key,
  instance_id       text not null,
  population_label  text not null,
  consented_research boolean,                -- null until consent submitted
  "group"           text,                   -- 'A' | 'B' | 'C'; null until set
  status            text not null default 'in_progress',
                                             -- 'in_progress' | 'completed' | 'withdrawn' | 'incomplete'
  order_seed        integer not null,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  part1_score       integer not null default 0,
  part2_score       integer not null default 0,
  total_score       integer not null default 0
);

-- ── demographics ─────────────────────────────────────────────────────────────
create table if not exists public.demographics (
  participant_code  text primary key references public.participants(participant_code) on delete cascade,
  role              text,
  field_domain      text,
  ai_familiarity    text,
  legal_exposure    text,
  prior_ai_research text
);

-- ── responses ────────────────────────────────────────────────────────────────
create table if not exists public.responses (
  id                  bigint generated always as identity primary key,
  participant_code    text not null references public.participants(participant_code) on delete cascade,
  instance_id         text not null,
  phase               integer not null,          -- 1 | 2
  item_id             integer not null references public.items(id),
  presentation_index  integer not null,          -- 0-based position in randomized order

  -- context (copied from items at write time for export convenience)
  "group"             text,
  case_context        text,
  stakes_tag          text,
  ground_truth        text,                      -- copied server-side, never from client

  -- Part 1 fields
  consulted               boolean,
  veriscan_score_shown    double precision,
  veriscan_judgment_shown text,                  -- 'authentic' | 'manipulated' | null (abstained)
  veriscan_abstained      boolean,
  veriscan_was_error      boolean,               -- derived server-side
  final_judgment          text,                  -- 'authentic' | 'manipulated' | 'cannot_tell'
  overrode_tool           boolean,
  override_correct        boolean,
  correct                 boolean,
  item_score              integer,

  -- Part 2 fields
  unlocks_purchased       integer,
  unlock_sequence         jsonb,
  last_unlock_before_commit integer,

  -- timing
  presented_at            timestamptz,
  committed_at            timestamptz,
  time_on_item_ms         integer,

  unique (participant_code, item_id, phase)
);

-- ── events ────────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id                  bigint generated always as identity primary key,
  participant_code    text not null references public.participants(participant_code) on delete cascade,
  instance_id         text not null,
  phase               integer,
  item_id             integer,
  presentation_index  integer,
  event_type          text not null,
    -- 'item_presented' | 'consult' | 'unlock' | 'commit_judgment'
    -- | 'abstain' | 'phase_advance' | 'resume'
  payload             jsonb,
  score_after         integer,
  client_ts           timestamptz,
  server_ts           timestamptz not null default now()
);

-- ── session_state ─────────────────────────────────────────────────────────────
-- One row per instance_id; clients subscribe via Realtime.
create table if not exists public.session_state (
  instance_id          text primary key,
  current_phase        text not null default 'waiting',
    -- 'waiting' | 'part1' | 'break' | 'part2' | 'results'
  leaderboard_revealed boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- ── emails (ISOLATED) ────────────────────────────────────────────────────────
-- No participant_code, no FK to research tables. Never joined or exported with research data.
create table if not exists public.emails (
  id           bigint generated always as identity primary key,
  instance_id  text not null,
  email        text not null,
  created_at   timestamptz not null default now()
);
