import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[dataClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Fill in .env.local and restart the dev server.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

export async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('session_state').select('current_phase').limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function startParticipant(): Promise<
  { participant_code: string; order_seed: number } | { error: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke('start-participant', {
      body: {
        instance_id: import.meta.env.VITE_INSTANCE_ID ?? 'test',
        population_label: import.meta.env.VITE_POPULATION_LABEL ?? '',
      },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { participant_code: string; order_seed: number }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function submitConsent(
  participantCode: string,
  consentedResearch: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-consent', {
      body: { participant_code: participantCode, consented_research: consentedResearch },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export interface DemographicsAnswers {
  role: string
  field_domain: string
  ai_familiarity: string
  legal_exposure: string
  prior_ai_research: string
}

export async function submitDemographics(
  participantCode: string,
  answers: DemographicsAnswers,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-demographics', {
      body: { participant_code: participantCode, ...answers },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function setGroup(
  participantCode: string,
  group: 'A' | 'B' | 'C',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('set-group', {
      body: { participant_code: participantCode, group },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export interface DisplayItem {
  id: number
  image_filename: string
  type: string
  family: string
  case_context: string
  stakes_tag: string
  presentation_index: number
}

export async function getSessionItems(
  participantCode: string,
): Promise<{ items: DisplayItem[]; group: string; total: number; part1_score: number } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('get-session-items', {
      body: { participant_code: participantCode },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { items: DisplayItem[]; group: string; total: number; part1_score: number }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function logItemPresented(
  participantCode: string,
  itemId: number,
  presentationIndex: number,
  clientTs: number,
): Promise<void> {
  try {
    await supabase.functions.invoke('log-item-presented', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        presentation_index: presentationIndex,
        client_ts: clientTs,
      },
    })
  } catch {
    // Fire-and-forget; idempotent on retry
  }
}

export async function consultVeriScan(
  participantCode: string,
  itemId: number,
  presentationIndex: number,
  clientTs: number,
): Promise<{ verdict: string; abstained: boolean; confidence: string | null; score: number } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('consult-veriscan', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        presentation_index: presentationIndex,
        client_ts: clientTs,
      },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { verdict: string; abstained: boolean; confidence: string | null; score: number }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function commitJudgment(
  participantCode: string,
  itemId: number,
  finalJudgment: 'authentic' | 'manipulated' | 'cannot_tell',
  presentationIndex: number,
  presentedAtTs: number,
  committedAtTs: number,
  rationale?: string,
): Promise<{ ok: boolean; score?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('commit-judgment', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        final_judgment: finalJudgment,
        presentation_index: presentationIndex,
        presented_at_ts: presentedAtTs,
        committed_at_ts: committedAtTs,
        rationale: rationale ?? null,
      },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return data as { ok: boolean; score: number }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Part 2 ────────────────────────────────────────────────────────────────────

export interface DisplayItemP2 extends DisplayItem {
  existing_unlocks: number[]
}

export interface TierContent {
  label: string
  text?: string
  display?: string
  verdict?: string
  abstained?: boolean
  confidence?: string | null
}

export async function getSessionItemsP2(
  participantCode: string,
): Promise<{ items: DisplayItemP2[]; group: string; total: number; total_score: number } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('get-session-items-p2', {
      body: { participant_code: participantCode },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { items: DisplayItemP2[]; group: string; total: number; total_score: number }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function logItemPresentedP2(
  participantCode: string,
  itemId: number,
  presentationIndex: number,
  clientTs: number,
): Promise<void> {
  try {
    await supabase.functions.invoke('log-item-presented-p2', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        presentation_index: presentationIndex,
        client_ts: clientTs,
      },
    })
  } catch {
    // Fire-and-forget; idempotent on retry
  }
}

export async function unlockTier(
  participantCode: string,
  itemId: number,
  tier: number,
  presentationIndex: number,
  clientTs: number,
): Promise<{ ok: boolean; tier: number; content: TierContent; total_score: number; charged: boolean } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('unlock-tier', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        tier,
        presentation_index: presentationIndex,
        client_ts: clientTs,
      },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { ok: boolean; tier: number; content: TierContent; total_score: number; charged: boolean }
  } catch (e) {
    return { error: String(e) }
  }
}

// ── Results & Leaderboard ─────────────────────────────────────────────────────

export interface ResultsData {
  participant_code: string
  group: string
  final_score: number
  p1: {
    total: number
    correct: number
    accuracy: number
    consult_count: number
    consult_rate: number
  }
  p2: {
    total: number
    correct: number
    accuracy: number
    avg_unlocks: number
    accuracy_by_unlocks: Array<{ unlocks: number; total: number; correct: number; accuracy: number }>
  }
  overall: { total: number; correct: number; accuracy: number }
  overrides: { count: number; correct: number; accuracy: number }
}

export async function getResults(
  participantCode: string,
): Promise<ResultsData | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('get-results', {
      body: { participant_code: participantCode },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as ResultsData
  } catch (e) {
    return { error: String(e) }
  }
}

export interface LeaderboardData {
  top_scorers: Array<{ participant_code: string; total_score: number }>
  most_accurate: Array<{ participant_code: string; accuracy: number; correct: number; total: number }>
  best_error_catchers: Array<{ participant_code: string; errors_caught: number }>
}

export async function getLeaderboard(
  instanceId: string,
): Promise<LeaderboardData | { error: string }> {
  try {
    // Participant-facing: deployed with --no-verify-jwt
    const { data, error } = await supabase.functions.invoke('get-leaderboard', {
      body: { instance_id: instanceId },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as LeaderboardData
  } catch (e) {
    return { error: String(e) }
  }
}

export async function commitJudgmentP2(
  participantCode: string,
  itemId: number,
  finalJudgment: 'authentic' | 'manipulated' | 'cannot_tell',
  presentationIndex: number,
  presentedAtTs: number,
  committedAtTs: number,
  rationale?: string,
): Promise<{ ok: boolean; total_score?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('commit-judgment-p2', {
      body: {
        participant_code: participantCode,
        item_id: itemId,
        final_judgment: finalJudgment,
        presentation_index: presentationIndex,
        presented_at_ts: presentedAtTs,
        committed_at_ts: committedAtTs,
        rationale: rationale ?? null,
      },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return data as { ok: boolean; total_score: number }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Admin functions (all require an active Supabase Auth session) ─────────────

export interface ParticipantInfo {
  participant_code: string
  group: string | null
  status: string
  consented_research: boolean
  started_at: string | null
  response_count: number
  updated?: boolean
}

export interface MonitorData {
  total: number
  by_status: { in_progress: number; completed: number; withdrawn: number; incomplete: number }
  by_group: { A: number; B: number; C: number; unset: number }
  part1_active: number
  part2_active: number
}

export async function adminSetPhase(
  instanceId: string,
  phase: string,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-set-phase', {
      body: { instance_id: instanceId, phase },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminToggleLeaderboard(
  instanceId: string,
  revealed: boolean,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-set-phase', {
      body: { instance_id: instanceId, leaderboard_revealed: revealed },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminGetMonitor(
  instanceId: string,
): Promise<MonitorData | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-get-monitor', {
      body: { instance_id: instanceId },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as MonitorData
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminLookupParticipant(
  instanceId: string,
  participantCode: string,
): Promise<ParticipantInfo | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-correct-group', {
      body: { instance_id: instanceId, participant_code: participantCode },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as ParticipantInfo
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminCorrectGroup(
  instanceId: string,
  participantCode: string,
  newGroup: 'A' | 'B' | 'C',
): Promise<ParticipantInfo | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-correct-group', {
      body: { instance_id: instanceId, participant_code: participantCode, new_group: newGroup },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as ParticipantInfo
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminWithdraw(
  instanceId: string,
  participantCode: string,
  confirmCode: string,
): Promise<{ ok: boolean; deleted_code: string } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-withdraw', {
      body: { instance_id: instanceId, participant_code: participantCode, confirm_code: confirmCode },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { ok: boolean; deleted_code: string }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminExport(
  instanceId: string,
  exportType: string,
  includeExcluded = false,
): Promise<{ csv: string } | { error: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Not authenticated' }

    // Raw fetch so we receive CSV text, not parsed JSON
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/admin-export`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ instance_id: instanceId, export_type: exportType, include_excluded: includeExcluded }),
      },
    )

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Export failed' }))
      return { error: (err as { error: string }).error ?? 'Export failed' }
    }

    const csv = await resp.text()
    return { csv }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function adminGetLeaderboard(
  instanceId: string,
): Promise<LeaderboardData | { error: string }> {
  try {
    // Admin console is authenticated; JWT is included automatically by supabase-js
    const { data, error } = await supabase.functions.invoke('admin-get-leaderboard', {
      body: { instance_id: instanceId },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as LeaderboardData
  } catch (e) {
    return { error: String(e) }
  }
}
