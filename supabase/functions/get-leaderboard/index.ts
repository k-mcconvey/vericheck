// Participant-facing leaderboard endpoint — no JWT required.
// Deploy with: npx supabase functions deploy get-leaderboard --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOP_N = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { instance_id } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [{ data: participants, error: pErr }, { data: responses, error: rErr }] = await Promise.all([
      sb.from('participants')
        .select('participant_code, total_score')
        .eq('instance_id', instance_id),
      sb.from('responses')
        .select('participant_code, phase, correct, veriscan_was_error, override_correct')
        .eq('instance_id', instance_id)
        .not('final_judgment', 'is', null),
    ])

    if (pErr) return json({ error: 'Failed to fetch participants' }, 500)
    if (rErr) return json({ error: 'Failed to fetch responses' }, 500)

    interface Agg {
      total_score: number
      correct: number
      total: number
      errors_caught: number
    }

    const agg: Record<string, Agg> = {}
    for (const p of (participants ?? [])) {
      agg[p.participant_code] = { total_score: p.total_score ?? 0, correct: 0, total: 0, errors_caught: 0 }
    }
    for (const r of (responses ?? [])) {
      if (!agg[r.participant_code]) continue
      agg[r.participant_code].total++
      if (r.correct) agg[r.participant_code].correct++
      if (r.phase === 1 && r.veriscan_was_error && r.override_correct === true) {
        agg[r.participant_code].errors_caught++
      }
    }

    const entries = Object.entries(agg).map(([code, a]) => ({
      participant_code: code,
      ...a,
      accuracy: a.total > 0 ? a.correct / a.total : 0,
    }))

    const top_scorers = [...entries]
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, total_score: e.total_score }))

    const most_accurate = [...entries]
      .filter(e => e.total > 0)
      .sort((a, b) => b.accuracy - a.accuracy || b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, accuracy: e.accuracy, correct: e.correct, total: e.total }))

    const best_error_catchers = [...entries]
      .filter(e => e.errors_caught > 0)
      .sort((a, b) => b.errors_caught - a.errors_caught || b.total_score - a.total_score)
      .slice(0, TOP_N)
      .map(e => ({ participant_code: e.participant_code, errors_caught: e.errors_caught }))

    return json({ top_scorers, most_accurate, best_error_catchers })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
