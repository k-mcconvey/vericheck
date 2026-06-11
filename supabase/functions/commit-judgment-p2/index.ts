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
    const { participant_code, item_id, final_judgment, presentation_index, presented_at_ts, committed_at_ts } =
      await req.json()

    if (!participant_code || item_id == null || !final_judgment || presentation_index == null) {
      return json(
        { error: 'participant_code, item_id, final_judgment, and presentation_index are required' },
        400,
      )
    }

    if (!['authentic', 'manipulated', 'cannot_tell'].includes(final_judgment)) {
      return json({ error: 'final_judgment must be authentic, manipulated, or cannot_tell' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('instance_id, group, part1_score, part2_score')
      .eq('participant_code', participant_code)
      .single()
    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    // Fetch existing responses row — needed for idempotency and unlock state
    const { data: existing } = await sb
      .from('responses')
      .select('final_judgment, unlock_sequence, unlocks_purchased')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 2)
      .maybeSingle()

    // Idempotency: already committed — return current score
    if (existing?.final_judgment) {
      const total_score = (participant.part1_score ?? 0) + (participant.part2_score ?? 0)
      return json({ ok: true, total_score })
    }

    const { data: item, error: iErr } = await sb
      .from('items')
      .select('ground_truth, case_context, stakes_tag')
      .eq('id', item_id)
      .single()
    if (iErr || !item) return json({ error: 'Item not found' }, 404)

    const correct = final_judgment !== 'cannot_tell' && final_judgment === item.ground_truth
    const item_score = correct ? 10 : final_judgment === 'cannot_tell' ? 0 : -5

    // last_unlock_before_commit = last element of the unlock_sequence at commit time
    const currentSeq: number[] = Array.isArray(existing?.unlock_sequence) ? existing.unlock_sequence as number[] : []
    const last_unlock_before_commit = currentSeq.length > 0 ? currentSeq[currentSeq.length - 1] : null

    const committed_at = committed_at_ts
      ? new Date(committed_at_ts).toISOString()
      : new Date().toISOString()
    const presented_at = presented_at_ts ? new Date(presented_at_ts).toISOString() : null
    const time_on_item_ms =
      presented_at_ts && committed_at_ts ? committed_at_ts - presented_at_ts : null

    // Upsert the responses row, preserving existing unlock fields
    await sb.from('responses').upsert(
      {
        participant_code,
        instance_id: participant.instance_id,
        phase: 2,
        item_id,
        presentation_index,
        group: participant.group,
        case_context: item.case_context,
        stakes_tag: item.stakes_tag,
        ground_truth: item.ground_truth,
        final_judgment,
        correct,
        item_score,
        last_unlock_before_commit,
        committed_at,
        ...(presented_at && { presented_at }),
        ...(time_on_item_ms != null && { time_on_item_ms }),
      },
      { onConflict: 'participant_code,item_id,phase' },
    )

    const newPart2Score = (participant.part2_score ?? 0) + item_score
    const newTotalScore = (participant.part1_score ?? 0) + newPart2Score

    await sb
      .from('participants')
      .update({ part2_score: newPart2Score, total_score: newTotalScore })
      .eq('participant_code', participant_code)

    await sb.from('events').insert({
      participant_code,
      instance_id: participant.instance_id,
      phase: 2,
      item_id,
      presentation_index,
      event_type: 'commit_judgment',
      payload: {
        final_judgment,
        correct,
        item_score,
        unlocks_purchased: existing?.unlocks_purchased ?? 0,
      },
      score_after: newTotalScore,
      client_ts: committed_at_ts ? new Date(committed_at_ts).toISOString() : null,
    })

    return json({ ok: true, total_score: newTotalScore })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
