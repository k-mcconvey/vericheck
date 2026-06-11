import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { participant_code } = await req.json()
    if (!participant_code) return json({ error: 'participant_code is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('instance_id, group, part1_score, part2_score, total_score')
      .eq('participant_code', participant_code)
      .single()
    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    const { data: responses, error: rErr } = await sb
      .from('responses')
      .select('phase, correct, consulted, overrode_tool, override_correct, unlocks_purchased, final_judgment')
      .eq('participant_code', participant_code)
      .not('final_judgment', 'is', null)
    if (rErr) return json({ error: 'Failed to fetch responses' }, 500)

    const rows = responses ?? []
    const p1 = rows.filter(r => r.phase === 1)
    const p2 = rows.filter(r => r.phase === 2)

    const p1Total = p1.length
    const p1Correct = p1.filter(r => r.correct).length
    const p1ConsultCount = p1.filter(r => r.consulted).length
    const p1OverrideCount = p1.filter(r => r.overrode_tool === true).length
    const p1OverrideCorrect = p1.filter(r => r.override_correct === true).length

    const p2Total = p2.length
    const p2Correct = p2.filter(r => r.correct).length
    const p2TotalUnlocks = p2.reduce((s, r) => s + (r.unlocks_purchased ?? 0), 0)

    const byUnlocks: Record<number, { total: number; correct: number }> = {}
    for (const r of p2) {
      const u = r.unlocks_purchased ?? 0
      if (!byUnlocks[u]) byUnlocks[u] = { total: 0, correct: 0 }
      byUnlocks[u].total++
      if (r.correct) byUnlocks[u].correct++
    }
    const accuracyByUnlocks = Object.entries(byUnlocks)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([unlocks, { total, correct }]) => ({
        unlocks: Number(unlocks),
        total,
        correct,
        accuracy: total > 0 ? correct / total : 0,
      }))

    const overallTotal = p1Total + p2Total
    const overallCorrect = p1Correct + p2Correct

    return json({
      participant_code,
      group: participant.group,
      final_score: participant.total_score ?? 0,
      p1: {
        total: p1Total,
        correct: p1Correct,
        accuracy: p1Total > 0 ? p1Correct / p1Total : 0,
        consult_count: p1ConsultCount,
        consult_rate: p1Total > 0 ? p1ConsultCount / p1Total : 0,
      },
      p2: {
        total: p2Total,
        correct: p2Correct,
        accuracy: p2Total > 0 ? p2Correct / p2Total : 0,
        avg_unlocks: p2Total > 0 ? p2TotalUnlocks / p2Total : 0,
        accuracy_by_unlocks: accuracyByUnlocks,
      },
      overall: {
        total: overallTotal,
        correct: overallCorrect,
        accuracy: overallTotal > 0 ? overallCorrect / overallTotal : 0,
      },
      overrides: {
        count: p1OverrideCount,
        correct: p1OverrideCorrect,
        accuracy: p1OverrideCount > 0 ? p1OverrideCorrect / p1OverrideCount : 0,
      },
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
