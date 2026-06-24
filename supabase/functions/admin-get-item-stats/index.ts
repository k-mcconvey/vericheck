// Admin: per-item aggregate performance for this instance.
// JWT required — do NOT deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function requireAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

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

    // items.phase is text: '1', '2', or 'exclude'
    const { data: items, error: iErr } = await sb
      .from('items')
      .select('id, phase, type, family, ground_truth, detector_regime')
      .in('phase', ['1', '2'])
      .order('phase')
      .order('id')

    if (iErr) return json({ error: iErr.message }, 500)
    if (!items || items.length === 0) return json({ items: [] })

    const itemIds = items.map(i => i.id)

    // responses.phase is integer (1 or 2); only include committed rows
    const { data: responses, error: rErr } = await sb
      .from('responses')
      .select('item_id, phase, final_judgment, correct, consulted, unlocks_purchased')
      .eq('instance_id', instance_id)
      .in('item_id', itemIds)
      .not('final_judgment', 'is', null)

    if (rErr) return json({ error: rErr.message }, 500)

    interface Agg { n: number; correct: number; incorrect: number; abstain: number; used_veriscan: number }
    const agg: Record<number, Agg> = {}
    for (const item of items) {
      agg[item.id] = { n: 0, correct: 0, incorrect: 0, abstain: 0, used_veriscan: 0 }
    }

    for (const r of (responses ?? [])) {
      const a = agg[r.item_id]
      if (!a) continue
      a.n++
      if (r.final_judgment === 'cannot_tell') {
        a.abstain++
      } else if (r.correct === true) {
        a.correct++
      } else {
        a.incorrect++
      }
      // Phase 1: consulted flag. Phase 2: any tier purchased (> 0).
      if (r.phase === 1 && r.consulted === true) a.used_veriscan++
      if (r.phase === 2 && (r.unlocks_purchased ?? 0) > 0) a.used_veriscan++
    }

    const pct = (num: number, n: number): number | null =>
      n === 0 ? null : Math.round((num / n) * 1000) / 10

    const result = items.map(item => {
      const a = agg[item.id]
      return {
        item_id: item.id,
        phase: item.phase,
        type: item.type,
        family: item.family,
        ground_truth: item.ground_truth,
        detector_regime: item.detector_regime,
        n: a.n,
        pct_correct: pct(a.correct, a.n),
        pct_incorrect: pct(a.incorrect, a.n),
        pct_abstain: pct(a.abstain, a.n),
        used_veriscan: a.used_veriscan,
        pct_used_veriscan: pct(a.used_veriscan, a.n),
      }
    })

    return json({ items: result })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
