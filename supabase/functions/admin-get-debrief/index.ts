// Admin: aggregate data for the end-of-session debrief dashboard (shown to participants on screen).
// Codes only, never names. Reveals ground truth and VeriScan scores — admin-only.
// JWT required — do NOT deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOP_N = 3
const HARDEST_N = 5
const MIN_ITEM_N = 3 // items need at least this many judgments to rank as "hardest"/"easiest"

async function requireAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

const pct = (num: number, n: number): number | null =>
  n === 0 ? null : Math.round((num / n) * 1000) / 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const uid = await requireAuth(req)
  if (!uid) return json({ error: 'Unauthorized' }, 401)

  try {
    const { instance_id } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [
      { data: participants, error: pErr },
      { data: responses, error: rErr },
      { data: items, error: iErr },
    ] = await Promise.all([
      sb.from('participants')
        .select('participant_code, group, status, total_score')
        .eq('instance_id', instance_id),
      sb.from('responses')
        .select('participant_code, phase, item_id, group, final_judgment, correct, consulted, ' +
          'veriscan_judgment_shown, veriscan_was_error, overrode_tool, override_correct, ' +
          'unlocks_purchased, time_on_item_ms')
        .eq('instance_id', instance_id)
        .not('final_judgment', 'is', null),
      sb.from('items')
        .select('id, image_filename, phase, type, family, case_context, stakes_tag, ground_truth, veriscan_score, detector_regime')
        .in('phase', ['1', '2']),
    ])

    if (pErr) return json({ error: 'Failed to fetch participants' }, 500)
    if (rErr) return json({ error: 'Failed to fetch responses' }, 500)
    if (iErr) return json({ error: 'Failed to fetch items' }, 500)

    // VeriScan verdict per item — same rule as commit-judgment
    const threshold = parseFloat(Deno.env.get('VERISCAN_THRESHOLD') ?? '0.5')
    const [bandLow, bandHigh] = (Deno.env.get('ABSTENTION_BAND') ?? '0.40,0.60').split(',').map(Number)
    const verdictOf = (score: number): 'authentic' | 'manipulated' | 'cannot_tell' =>
      score >= bandLow && score <= bandHigh ? 'cannot_tell' : score >= threshold ? 'manipulated' : 'authentic'

    const rows = responses ?? []
    const itemList = items ?? []

    // ── Participants & leaderboards ─────────────────────────────────────────
    interface PAgg { group: string | null; total_score: number; correct: number; total: number; errors_caught: number }
    const pAgg: Record<string, PAgg> = {}
    for (const p of (participants ?? [])) {
      pAgg[p.participant_code] = { group: p.group, total_score: p.total_score ?? 0, correct: 0, total: 0, errors_caught: 0 }
    }
    for (const r of rows) {
      const a = pAgg[r.participant_code]
      if (!a) continue
      a.total++
      if (r.correct) a.correct++
      if (r.phase === 1 && r.veriscan_was_error && r.override_correct === true) a.errors_caught++
    }
    const entries = Object.entries(pAgg).map(([code, a]) => ({
      participant_code: code, ...a, accuracy: a.total > 0 ? a.correct / a.total : 0,
    }))
    const played = entries.filter(e => e.total > 0)

    const top_scorers = [...played]
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, total_score: e.total_score }))
    const most_accurate = [...played]
      .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total || b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, accuracy: e.accuracy, correct: e.correct, total: e.total }))
    const best_error_catchers = [...played]
      .filter(e => e.errors_caught > 0)
      .sort((a, b) => b.errors_caught - a.errors_caught || b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, errors_caught: e.errors_caught }))

    // ── Crowd overall ───────────────────────────────────────────────────────
    const judged = rows.length
    const correctN = rows.filter(r => r.correct === true).length
    const abstainN = rows.filter(r => r.final_judgment === 'cannot_tell').length
    const timed = rows.filter(r => typeof r.time_on_item_ms === 'number' && r.time_on_item_ms > 0)
    const avgSec = (rs: typeof rows) =>
      rs.length === 0 ? null : Math.round(rs.reduce((s, r) => s + (r.time_on_item_ms as number), 0) / rs.length / 100) / 10

    // ── Human vs VeriScan, per phase ────────────────────────────────────────
    const itemById = new Map(itemList.map(i => [i.id, i]))
    const phaseSummary = [1, 2].map(phase => {
      const pr = rows.filter(r => r.phase === phase)
      const phaseItems = itemList.filter(i => i.phase === String(phase))
      const vsCorrect = phaseItems.filter(i => verdictOf(i.veriscan_score) === i.ground_truth).length
      const vsAbstain = phaseItems.filter(i => verdictOf(i.veriscan_score) === 'cannot_tell').length
      return {
        phase,
        n: pr.length,
        crowd_pct_correct: pct(pr.filter(r => r.correct === true).length, pr.length),
        crowd_pct_abstain: pct(pr.filter(r => r.final_judgment === 'cannot_tell').length, pr.length),
        items: phaseItems.length,
        veriscan_pct_correct: pct(vsCorrect, phaseItems.length),
        veriscan_pct_abstain: pct(vsAbstain, phaseItems.length),
      }
    })

    // ── Groups (A: no tool, B: tool, C: tool + limitations briefing) ─────────
    const groups = (['A', 'B', 'C'] as const).map(g => {
      const gr = rows.filter(r => (r.group ?? pAgg[r.participant_code]?.group) === g)
      const p1 = gr.filter(r => r.phase === 1)
      const p2 = gr.filter(r => r.phase === 2)
      return {
        group: g,
        participants: entries.filter(e => e.group === g && e.total > 0).length,
        pct_correct: pct(gr.filter(r => r.correct === true).length, gr.length),
        part1_pct_correct: pct(p1.filter(r => r.correct === true).length, p1.length),
        part2_pct_correct: pct(p2.filter(r => r.correct === true).length, p2.length),
        avg_score: (() => {
          const ge = entries.filter(e => e.group === g && e.total > 0)
          return ge.length === 0 ? null : Math.round(ge.reduce((s, e) => s + e.total_score, 0) / ge.length)
        })(),
      }
    })

    // ── Trust in the tool (Part 1, consulted, tool gave a verdict) ──────────
    const consulted = rows.filter(r => r.phase === 1 && r.consulted === true && r.veriscan_judgment_shown)
    const toolWrong = consulted.filter(r => r.veriscan_was_error === true)
    const toolRight = consulted.filter(r => r.veriscan_was_error === false)
    const followed = (rs: typeof rows) => rs.filter(r => r.final_judgment === r.veriscan_judgment_shown).length
    const trust = {
      consultations: consulted.length,
      consult_rate: pct(
        rows.filter(r => r.phase === 1 && r.consulted === true).length,
        rows.filter(r => r.phase === 1 && (r.group ?? pAgg[r.participant_code]?.group) !== 'A').length,
      ),
      tool_wrong_n: toolWrong.length,
      followed_when_wrong_pct: pct(followed(toolWrong), toolWrong.length),
      caught_when_wrong_pct: pct(toolWrong.filter(r => r.override_correct === true).length, toolWrong.length),
      tool_right_n: toolRight.length,
      followed_when_right_pct: pct(followed(toolRight), toolRight.length),
    }

    // ── Part 2: did buying more information help? ───────────────────────────
    const p2 = rows.filter(r => r.phase === 2)
    const p2None = p2.filter(r => (r.unlocks_purchased ?? 0) === 0)
    const p2Some = p2.filter(r => (r.unlocks_purchased ?? 0) > 0)
    const unlocks = {
      n: p2.length,
      avg_unlocks: p2.length === 0 ? null
        : Math.round(p2.reduce((s, r) => s + (r.unlocks_purchased ?? 0), 0) / p2.length * 10) / 10,
      no_unlock_n: p2None.length,
      no_unlock_pct_correct: pct(p2None.filter(r => r.correct === true).length, p2None.length),
      some_unlock_n: p2Some.length,
      some_unlock_pct_correct: pct(p2Some.filter(r => r.correct === true).length, p2Some.length),
    }

    // ── Items: hardest & easiest ────────────────────────────────────────────
    interface IAgg { n: number; correct: number; abstain: number; said_authentic: number; said_manipulated: number }
    const iAgg = new Map<number, IAgg>()
    for (const r of rows) {
      if (!itemById.has(r.item_id)) continue
      const a = iAgg.get(r.item_id) ?? { n: 0, correct: 0, abstain: 0, said_authentic: 0, said_manipulated: 0 }
      a.n++
      if (r.correct === true) a.correct++
      if (r.final_judgment === 'cannot_tell') a.abstain++
      if (r.final_judgment === 'authentic') a.said_authentic++
      if (r.final_judgment === 'manipulated') a.said_manipulated++
      iAgg.set(r.item_id, a)
    }
    const itemStats = itemList
      .filter(i => (iAgg.get(i.id)?.n ?? 0) > 0)
      .map(i => {
        const a = iAgg.get(i.id)!
        const verdict = verdictOf(i.veriscan_score)
        return {
          item_id: i.id,
          image_filename: i.image_filename,
          phase: i.phase,
          type: i.type,
          family: i.family,
          case_context: i.case_context,
          stakes_tag: i.stakes_tag,
          ground_truth: i.ground_truth,
          veriscan_score: i.veriscan_score,
          veriscan_verdict: verdict,
          veriscan_correct: verdict === i.ground_truth,
          detector_regime: i.detector_regime,
          n: a.n,
          pct_correct: pct(a.correct, a.n)!,
          pct_wrong: pct(a.n - a.correct - a.abstain, a.n)!,
          pct_abstain: pct(a.abstain, a.n)!,
          pct_said_authentic: pct(a.said_authentic, a.n)!,
          pct_said_manipulated: pct(a.said_manipulated, a.n)!,
        }
      })
    const rankable = itemStats.filter(i => i.n >= MIN_ITEM_N).length >= HARDEST_N
      ? itemStats.filter(i => i.n >= MIN_ITEM_N)
      : itemStats
    const hardest = [...rankable]
      .sort((a, b) => a.pct_correct - b.pct_correct || b.pct_wrong - a.pct_wrong || b.n - a.n)
      .slice(0, HARDEST_N)
    const easiest = [...rankable]
      .sort((a, b) => b.pct_correct - a.pct_correct || b.n - a.n)
      .slice(0, 1)
    const byTruth = (['manipulated', 'authentic'] as const).map(t => {
      const tr = rows.filter(r => itemById.get(r.item_id)?.ground_truth === t)
      return { ground_truth: t, n: tr.length, pct_correct: pct(tr.filter(r => r.correct === true).length, tr.length) }
    })
    const byType = (['image', 'document'] as const).map(t => {
      const tr = rows.filter(r => itemById.get(r.item_id)?.type === t)
      return { type: t, n: tr.length, pct_correct: pct(tr.filter(r => r.correct === true).length, tr.length) }
    })

    return json({
      participants: {
        total: played.length,
        completed: (participants ?? []).filter(p => p.status === 'completed').length,
      },
      overall: {
        judgments: judged,
        pct_correct: pct(correctN, judged),
        pct_abstain: pct(abstainN, judged),
        avg_seconds: avgSec(timed),
        avg_seconds_correct: avgSec(timed.filter(r => r.correct === true)),
        avg_seconds_wrong: avgSec(timed.filter(r => r.correct !== true && r.final_judgment !== 'cannot_tell')),
      },
      top_scorers,
      most_accurate,
      best_error_catchers,
      phases: phaseSummary,
      groups,
      trust,
      unlocks,
      by_truth: byTruth,
      by_type: byType,
      hardest,
      easiest,
      min_item_n: rankable === itemStats ? 1 : MIN_ITEM_N,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
