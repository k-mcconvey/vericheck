# VeriCheck Verification Challenge — Build Spec for Claude Code (Supabase)

**Purpose.** A complete build specification to hand to Claude Code (in Cursor). It describes a web app that runs the in-person "VeriCheck" verification exercise for U of T Protocol #65720. Build on **Supabase**. **[CONFIG]** = set per deployment; **[CONTENT — researcher supplies]** = leave a typed slot.

Read the whole document first. Keep all data access behind one `dataClient` module (§3) so the backend stays swappable.

---

## 1. What you are building

A session-based web app for a single, facilitator-run, ~3-hour in-person session. Flow: landing/code → two-tier consent → demographic survey → group selection (A/B/C) → **Part 1** (verification shift, optional paid AI consult for B/C) → break → **Part 2** (tiered paid unlocks) → personal results → optional follow-up email → withdrawal info. A separate **facilitator/admin console** gates phases, monitors progress, reveals the leaderboard, exports data, and deletes by identifier. Briefings and the debrief discussion are delivered **verbally and are out of app scope**; the app records group but never displays briefing text.

---

## 2. Data-handling requirements (non-negotiable)

- **No direct identifiers in research data.** Everything links only to a random participant code. Never collect a name.
- **Follow-up email is stored in a separate table with no link** to the participant code or task data; never in the analysis export (§11).
- **HTTPS only; scoring is server-authoritative.** Every scored action is computed and written by an Edge Function (§3, §10). Ground truth, detector scores, and locked tier content are never sent to the browser ahead of time (§6).
- **Two-tier consent.** A participant may do the activity without consenting to research inclusion; activity-only participants still play and appear on the leaderboard, but are tagged `consented_research = false` and excluded from the analysis export.
- **Deception + withdrawal.** Disclosed verbally at debrief. Surface the participant code persistently and on results, for the **7-day** withdrawal window. Withdrawal is facilitator-run (delete-by-code in admin); no participant self-delete.
- **No third-party trackers/analytics.** Self-host fonts/assets. Stimulus images are **bundled with the app** (§6), so the only external network calls are to Supabase.
- **Admin console is authenticated** and unreachable from the participant flow.

---

## 3. Tech stack & architecture

- **Front end:** React + Vite + TypeScript; plain CSS or Tailwind; mobile-first responsive (laptop primary; works on tablet/phone).
- **Backend:** **Supabase** — Postgres, **Edge Functions** (Deno) as the write/scoring API, **Supabase Auth** (admin), **Realtime** (phase + leaderboard push).
- **`src/data/dataClient.ts`** is the only module importing `supabase-js`. UI/game logic call its methods (`startParticipant`, `submitConsent`, `consultVeriScan`, `unlock`, `commitJudgment`, `getResults`, …).
- **Server-authoritative scoring.** `consult` / `unlock` / `commit` call Edge Functions that read the secret item fields server-side, compute the score delta, write `responses`/`events`, and return only what the client may see.
- **Security boundary = RLS + Edge Functions.** The anon key is public, so enable **RLS on every table**; the anon role cannot read/write research tables directly. Service-role key lives only in Edge Function secrets. Display-safe item fields are exposed through a scoped read that omits answers (§6).
- **Minimal client state:** participant code + current position in `sessionStorage` for refresh-resume. Canonical record is Postgres.
- **Edge Function surface:** `start-participant`, `submit-consent`, `submit-demographics`, `set-group`, `get-session-items`, `consult-veriscan`, `unlock-tier`, `commit-judgment`, `get-results`, `submit-email`, plus admin-only `admin-set-phase`, `admin-get-monitor`, `admin-get-leaderboard`, `admin-export`, `admin-correct-group`, `admin-withdraw`.

---

## 4. Deployment & instances

- **Repo:** researcher's GitHub (private). **Front end:** Vercel or Netlify (auto-deploy on push; HTTPS automatic). **Backend:** one Supabase project; the three contexts are distinguished by an **`instance_id` column**, not separate projects.
- Instances: `test` (internal), `student` (Summer School), `stakeholder` (project meeting).

```
VITE_INSTANCE_ID = "student"               # [CONFIG] test | student | stakeholder
VITE_POPULATION_LABEL = "Summer School"    # [CONFIG] tagged on every row; not shown to participants
VITE_EVENT_NAME = "CIFAR Summer School 2026"
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
VITE_STARTING_SCORE = 0                     # [CONFIG]
VITE_VERISCAN_THRESHOLD = 0.5               # [CONFIG] score >= threshold → "manipulated"
VITE_ABSTENTION_BAND = "0.40,0.60"          # [CONFIG] scores inside band → VeriScan is uncertain (see §6)
VITE_SHOW_RAW_SCORE = false                 # [CONFIG] show numeric score vs qualitative confidence (see §6)
# Service-role key: Edge Function secrets only.
```

A fresh instance = a new front-end deployment with a different `VITE_INSTANCE_ID` against the same Supabase project. Every admin view, leaderboard, and export filters by `instance_id`.

---

## 5. Data model (Postgres; RLS on all; every research row carries `instance_id`, `population_label`)

**items** — seeded manifest (§6), holds answers (`ground_truth`, `veriscan_score`, phase-2 tier text). Anon role: **no select**. Edge Functions read via service role; a display-safe read exposes only non-answer fields.

**participants** — `participant_code` (PK), `instance_id`, `population_label`, `consented_research`, `group` (A|B|C), `status` (in_progress|completed|withdrawn|incomplete), `order_seed` (int — drives this participant's randomized item order), `started_at`, `completed_at`, `part1_score`, `part2_score`, `total_score`.

**demographics** — one row/participant: `role`, `field_domain`, `ai_familiarity`, `legal_exposure`, `prior_ai_research`.

**responses** — one row per participant × item:
- keys: `participant_code`, `instance_id`, `phase` (1|2), `item_id`, `presentation_index` (0-based position in THIS participant's randomized order)
- context: `group`, `case_context`, `stakes_tag`, `ground_truth`
- Part 1: `consulted`, `veriscan_score_shown` (real score from items), `veriscan_judgment_shown` (derived), `veriscan_abstained`, `veriscan_was_error` (derived: judgment present and ≠ ground_truth), `final_judgment` (authentic|manipulated|cannot_tell), `overrode_tool` (null if not consulted), `override_correct` (null otherwise), `correct`, `item_score`
- Part 2: `unlocks_purchased` (0–5), `unlock_sequence` (jsonb), `last_unlock_before_commit`, `final_judgment`, `correct`, `item_score`
- timing: `presented_at`, `committed_at`, `time_on_item_ms`

**events** — append-only: `id`, `participant_code`, `instance_id`, `phase`, `item_id`, `presentation_index`, `event_type` (item_presented|consult|unlock|commit_judgment|abstain|phase_advance|resume), `payload` (jsonb), `score_after`, `client_ts`, `server_ts`.

**session_state** — one row/`instance_id`: `current_phase`, `leaderboard_revealed`, `updated_at`. Clients subscribe via Realtime.

**emails** (ISOLATED) — `id`, `instance_id`, `email`, `created_at`. No `participant_code`, no FK. RLS: insert-only (anon via Edge Function), select admin-only.

---

## 6. Stimuli & VeriScan outputs (from the real detector data)

**Images are bundled with the app.** The 47 resized images live in the repo at `public/stimuli/` named by `id` (e.g. `1.png` … `47.png`); the manifest references `image_filename`. (Copy them from the researcher's `…/summer_school/images/resized_images` folder into `public/stimuli/`; confirm the extension matches.) No external image hosting.

**VeriScan's outputs are derived from the real detector score**, not hand-authored. The manifest (`veriscan_manifest.json`, generated from `selected_images.xlsx`) seeds the `items` table. Per item the **answer fields are server-only**: `ground_truth`, `veriscan_score` (0–1, high = more likely AI/manipulated), and the phase-2 tier text.

Server-side derivation in Edge Functions, from `veriscan_score` + config:
- **Abstention:** if `ABSTENTION_BAND[0] ≤ score ≤ ABSTENTION_BAND[1]` (default 0.40–0.60), VeriScan returns **"uncertain / cannot determine"** (an abstention). These are the curated ~0.5 items.
- **Judgment (outside the band):** `score ≥ VERISCAN_THRESHOLD` → "manipulated", else "authentic".
- **`veriscan_was_error`** = a (non-abstaining) judgment that disagrees with `ground_truth`. These are the curated confident-error items (e.g., real dashcams scored ~0.999, fake images scored ~0.000).
- **Confidence (Part 2 tier 3):** if `SHOW_RAW_SCORE` is false, present qualitative confidence derived from `|score − 0.5|` (High ≥ 0.40, Medium ≥ 0.15, else Low); if true, show the numeric score (e.g., "0.97 likelihood AI-generated"). **[DECISION PENDING — see chat]**

Per-item manifest fields:

```jsonc
{
  "id": 7,
  "image_filename": "7.png",        // bundled at public/stimuli/7.png
  "phase": 1,                        // [ASSIGN] 1 | 2 | "exclude"
  "type": "image",                   // "image" | "document"
  "family": "dashcam",               // consumer photo | dashcam | surveillance | document | email | receipt
  "case_context": "Dashcam still submitted in a motor-vehicle accident dispute", // edit freely
  "stakes_tag": "civil",             // civil | criminal | administrative
  "ground_truth": "authentic",       // SERVER-ONLY (from true_label)
  "veriscan_score": 0.999295,        // SERVER-ONLY real detector score
  "detector_regime": "confident_error", // helper for curation: confident_correct | uncertain | confident_error
  // ---- Part 2 items only ----
  "p2_metadata": "Image file; claimed source: dashcam", // tier 1 [AUTHOR if real metadata wanted]
  "p2_explanation": "",              // tier 4 [AUTHOR]
  "p2_limitations": ""               // tier 5 [AUTHOR]
}
```

**Phase membership is data-driven** by the `phase` field (no hardcoded 20/10 split): the app presents all `phase: 1` items, then all `phase: 2` items, and ignores `"exclude"`. Assign these per item — the `detector_regime` helper lets you balance confident-correct / uncertain / error across conditions. If you want Part 2 to stay error-free (as in the original design), assign only `confident_correct`/`uncertain` items to phase 2.

---

## 7. Presentation order (randomized per participant)

- Each participant gets a stored `order_seed`. Within each phase, items are shuffled by that seed, so **every participant sees the same item set per phase but in a different order**, preserving between-subjects comparisons while removing order confounds.
- Record `presentation_index` (0-based) on every `responses` and `events` row so order effects are analyzable.
- The "every 5 items" interstitial counts positions in the randomized sequence.

---

## 8. Participant flow & screens

Phases are facilitator-gated via `session_state.current_phase` (Realtime); within an open phase participants self-pace.

1. **Landing** — `start-participant` issues the code + `order_seed`.
2. **Consent (two-tier)** — render `CONSENT_TEXT` (Appendix B); required single choice between "consent to research" (`consented_research = true`) and "exercise only" (`false`); plus a "had the chance to ask questions" acknowledgment.
3. **Demographics** — the 5 questions in §9, verbatim.
4. **Group selection** — three buttons A/B/C + confirm; `set-group`. (B and C behave identically in-app; only the verbal briefing differs. Record the exact group.)
5. **Part 1 — Verification shift**, per item (randomized order):
   - Show image (`public/stimuli/<id>`) + `case_context` + scoring reminder + running score.
   - **Group A:** authentic / manipulated / cannot-tell → `commit-judgment`.
   - **Groups B/C:** commit immediately, **or** "Consult VeriScan (−3)" → `consult-veriscan` returns the derived judgment/abstention (and confidence or raw score per config) for that item → then commit a final judgment.
   - 5-item interstitial: "5 of N. Score: 32. Consulted twice."
6. **Break** (gated).
7. **Part 2 — Tiered reports**, per item (randomized order): sequential unlocks, each **−2**, via `unlock-tier`: tier 1 metadata → tier 2 VeriScan judgment → tier 3 confidence/score → tier 4 explanation → tier 5 limitations. Commit anytime; record `unlock_sequence`, `last_unlock_before_commit`.
8. **Results** — `get-results` (see §13). Show code prominently.
9. **Follow-up email (optional)** — `submit-email` → isolated table. Skippable.
10. **Withdrawal info** — 7-day window + code; how to withdraw. No self-delete.

Running score visible throughout; **leaderboard hidden until facilitator reveal** (`leaderboard_revealed` via Realtime).

---

## 9. Demographic survey (verbatim — Instrument 1)

1. **Current role?** Masters student · PhD student · Postdoctoral researcher · Faculty/academic researcher · Legal professional · Judicial officer · Policy professional · Other (free text)
2. **Primary field of study or professional domain?** (free text)
3. **Familiarity with AI tools?** No experience · Heard of, rarely/never used · Use occasionally · Use regularly · Develop/research AI tools professionally
4. **Prior exposure to legal proceedings?** No exposure · Minimal (media/coursework) · Some direct experience · Substantial professional experience
5. **Previously participated in research involving AI-assisted decision-making?** Yes · No · Unsure

---

## 10. Scoring engine (in Edge Functions)

Single currency, starts at `STARTING_SCORE` (default 0), may go negative.
- Correct: **+10** · Incorrect: **−5** · Abstain ("cannot tell"): **0** · Part 1 consult: **−3** (charged on consult, even if the participant then abstains) · Part 2 unlock: **−2** each.

Server-side, written to `responses`:
- `correct` = `final_judgment == ground_truth` (abstention never correct, scores 0).
- `overrode_tool` (Part 1, consulted, non-abstaining) = `final_judgment != veriscan_judgment_shown`.
- `override_correct` = `overrode_tool AND correct`. **Catching a detector error** = `overrode_tool AND veriscan_was_error AND correct`.

Maintain `part1_score`, `part2_score`, `total_score`. Edge Functions idempotent per (participant, item, action) — no double-charge on retry.

---

## 11. Follow-up email isolation

Collected only at step 9, written to `emails` (no `participant_code`, never joined to research data, never in the analysis export). The only export touching it is a clearly-labelled dissemination-list export, used then deleted.

---

## 12. Facilitator / admin console

Authenticated route (`/admin`) via **Supabase Auth** (team accounts, no public sign-up); every view filters by `instance_id`. Features: phase control (writes `session_state`, pushed via Realtime); live monitor (counts per status/group, no identifying info); group correction (`admin-correct-group`); leaderboard view (§13); exports (§14); **withdraw** (`admin-withdraw`: code → preview → re-type code → permanently delete that code's rows from `participants`/`demographics`/`responses`/`events`; log code+timestamp only; never touches `emails`). All admin mutations verify the Auth session in the Edge Function.

---

## 13. Personal results & leaderboard

**Personal results** (Instrument 3 Part B): accuracy (Part 1/Part 2/overall); consultation count + rate (B/C); override count + override-accuracy; Part 2 average unlocks and accuracy-by-unlocks; final score. Factual, non-judgmental.

**Leaderboard** (facilitator reveal only; current `instance_id`; **codes only, never names**): Top scorers (by `total_score`); **Most Accurate** (highest overall accuracy); **Best at Catching Errors** (most correct overrides on `veriscan_was_error` items). Celebratory, not evaluative.

---

## 14. CSV exports (`admin-export`, filtered by `instance_id`; Table Editor export is a fallback)

1. **`responses.csv`** — wide per-participant×item (§5), incl. `presentation_index`, `veriscan_score_shown`, `veriscan_was_error`. Filtered to `consented_research = true` (toggle to include excluded rows for QA).
2. **`events.csv`** — raw event log.
3. **`participants_summary.csv`** — one row/participant + joined demographics + scores + `order_seed`.
4. **`dissemination_emails.csv`** — isolated email list only.

All research exports carry `instance_id` and `population_label`.

---

## 15. UI / UX

Laptop-primary, usable on tablet/phone (single column, large targets, images scale, no horizontal scroll). Clear running score; cost confirmation before any paid action. Image viewer with zoom; lazy-load; if a bundled image fails, show `id` + "image failed to load" and log it. Keyboard-accessible, visible focus, WCAG AA. English only. No pressure cues beyond the score. Don't advance until committed; disable controls while an Edge Function call is in flight (rely on idempotency for retries).

---

## 16. Content / setup the researcher provides

- **`CONSENT_TEXT`** + two statements — Appendix B (fill bracketed contacts).
- **Images:** copy the 47 resized files into `public/stimuli/` as `<id>.<ext>`; confirm extension.
- **Manifest:** start from generated `veriscan_manifest.json`; **assign `phase` (1/2/exclude) per item**, edit `case_context`/`stakes_tag`, and author `p2_*` for phase-2 items. Seed into `items`.
- **Group C briefing (verbal):** compute the real detector's accuracy on the phase-1 set and describe its actual failure modes (Appendix A).
- Per-instance config (§4); Supabase project + service-role secret + admin Auth accounts.

---

## 17. Acceptance checklist

- [ ] No name/direct identifier in research tables; email isolated and never joined or exported with research data.
- [ ] RLS on every table; anon key can't read/write research tables; all writes via Edge Functions.
- [ ] `ground_truth`, `veriscan_score`, and locked tier content never reach the browser early; `get-session-items` returns display-safe fields only.
- [ ] VeriScan judgment/abstention/confidence derived server-side from `veriscan_score` + config (threshold, band, raw-vs-qualitative); `veriscan_was_error` computed correctly.
- [ ] Images served from `public/stimuli/`; no external image calls.
- [ ] Order randomized per participant via `order_seed`; same item set per phase; `presentation_index` recorded everywhere.
- [ ] Scoring matches §10; Edge Functions idempotent; refresh resumes without data loss.
- [ ] Two-tier consent; activity-only players appear on leaderboard but excluded from analysis export.
- [ ] Group A has no consult; B/C do; group recorded and correctable.
- [ ] Part 1 −3 consult (incl. when abstaining after); Part 2 sequential −2 unlocks; phase membership read from manifest `phase`.
- [ ] Running score visible; leaderboard hidden until reveal; phase gating via `session_state` + Realtime.
- [ ] Personal results per Instrument 3; leaderboard codes-only with the three categories.
- [ ] Participant code persistent + on results/withdrawal with the 7-day note.
- [ ] Admin gated by Supabase Auth; phase control; four CSV exports; delete-by-code with double confirm; admin mutations verify Auth.
- [ ] One project; all rows carry `instance_id`/`population_label`; admin views/leaderboard/exports filter by it.

---

## Appendix A — Group C limitations briefing (verbal; for truthfulness with the real detector)

The facilitator reads this to Group C; the app does not display it. Because VeriScan now surfaces a **real detector's** scores on the curated corpus, make the briefing truthful to that detector's actual behavior: compute its accuracy on the phase-1 item set and describe its real failure modes (e.g., the families/manipulation types where it confidently errs, and that it is least certain on borderline items it reports as "uncertain"). The curated set is ~one-third confidently-correct, one-third uncertain, one-third confident errors, so a generic "usually right" framing would be misleading — state numbers that match the items you actually assign to Part 1.

---

## Appendix B — Consent content (for the in-app consent screen) [fill bracketed placeholders]

**INFORMED CONSENT — Algorithmic Transparency and Trust in AI-Assisted Evidence Assessment**
Principal Investigators: Dr. Ebrahim Bagheri (University of Toronto) and Dr. Maura R. Grossman (University of Waterloo)

*What is this?* You are about to take part in a gamified exercise in which you assess whether images and documents submitted as evidence in fictional legal cases are authentic or manipulated. You may also interact with an AI verification tool as part of the exercise.

*Research component.* This exercise is part of a research study investigating how people engage with AI-assisted verification tools, including how different types of information about the tool affect decision-making. Findings may be published in academic venues.

*What data will be collected?* If you consent, the following anonymized data is included in the research dataset: your task responses (judgments, interactions with the AI tool, timestamps, point totals) and your demographic survey responses. You are identified only by a randomly assigned code; your name is not recorded alongside your task data.

*What you should know.* To preserve the integrity of the study, certain details about the design will not be disclosed until the debrief, which will explain them fully; you may withdraw your data after that disclosure.

*The prize.* CIFAR is offering a prize to top performers as part of event programming; it is not provided by the research team. You may participate and be eligible whether or not you consent to the research.

*Your rights.* Research participation is voluntary. You may take part in the exercise without consenting to the research. You may withdraw during the session by closing the interface, or after the session by contacting the research team within seven days. Withdrawal has no effect on your standing at the event, your relationship with the research team, or prize eligibility. To withdraw after the session, contact: *[designated contact name and email]*.

*Questions?* Ask the facilitator now, or contact the investigators: *[PI name, email]*. For concerns about your rights as a research participant: *[REB office name, phone, email]*.

**Consent statements (required single choice):**
- ☐ I have read and understood the above and I consent to having my anonymized task data and survey responses included in the research dataset.
- ☐ I do not wish to participate in the research but would like to take part in the exercise.
