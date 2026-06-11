-- VeriCheck Row Level Security
-- Run AFTER 01_schema.sql.
-- Security model: anon key cannot read/write any research table.
-- All participant writes go through Edge Functions (service role).
-- Only session_state and items (display-safe subset via Edge Function) are
-- readable by authenticated/anon in controlled ways.

-- ── Enable RLS on every table ────────────────────────────────────────────────
alter table public.items           enable row level security;
alter table public.participants    enable row level security;
alter table public.demographics    enable row level security;
alter table public.responses       enable row level security;
alter table public.events          enable row level security;
alter table public.session_state   enable row level security;
alter table public.emails          enable row level security;

-- ── items: anon has NO select ────────────────────────────────────────────────
-- Edge Functions read via service role; ground_truth/veriscan_score never leave server.
-- (No policies = no access for any non-service role.)

-- ── participants: no direct access ───────────────────────────────────────────
-- (No policies.)

-- ── demographics: no direct access ───────────────────────────────────────────
-- (No policies.)

-- ── responses: no direct access ───────────────────────────────────────────────
-- (No policies.)

-- ── events: no direct access ─────────────────────────────────────────────────
-- (No policies.)

-- ── session_state: anon may SELECT (needed for Realtime subscription) ─────────
create policy "anon can read session_state"
  on public.session_state
  for select
  to anon, authenticated
  using (true);

-- Only service role (Edge Functions) may insert/update session_state.
-- (No insert/update policies for anon/authenticated.)

-- ── emails: anon may INSERT via Edge Function only ────────────────────────────
-- We intentionally do NOT allow direct anon insert; inserts go through
-- the submit-email Edge Function which uses service role.
-- SELECT is admin-only (no policy for anon/authenticated).

-- ── Admin note ────────────────────────────────────────────────────────────────
-- Admin mutations (phase control, export, withdraw) are performed by Edge
-- Functions that verify a Supabase Auth JWT and use service role internally.
-- No additional RLS policies are needed for the admin role here;
-- service role bypasses RLS entirely.
