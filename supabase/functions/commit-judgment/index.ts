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
    const { participant_code, item_id, final_judgment, presentation_index, presented_at_ts, committed_at_ts, rationale } =
      await req.json()
    const rationaleValue: string | null =
      typeof rationale === 'string' && rationale.trim() ? rationale.trim() : null

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

    // Fetch existing responses row — needed for idempotency AND for consult context
    const { data: existing } = await sb
      .from('responses')
      .select('final_judgment, consulted, veriscan_judgment_shown, veriscan_abstained')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 1)
      .maybeSingle()

    // Idempotency: already committed — return the current running score
    if (existing?.final_judgment) {
      return json({ ok: true, score: participant.part1_score })
    }

    // Fetch item: ground_truth and veriscan_score are server-only
    const { data: item, error: iErr } = await sb
      .from('items')
      .select('case_context, stakes_tag, ground_truth, veriscan_score')
      .eq('id', item_id)
      .single()
    if (iErr || !item) return json({ error: 'Item not found' }, 404)

    // --- Scoring ---

    // correct: abstention is never correct
    const correct = final_judgment !== 'cannot_tell' && final_judgment === item.ground_truth
    const item_score = correct ? 10 : final_judgment === 'cannot_tell' ? 0 : -5

    // veriscan_was_error: item-level attribute — tool gave a non-abstaining judgment that disagrees
    // with ground_truth. Recorded for all items so leaderboard "Catching Errors" works for Group A too.
    const threshold = parseFloat(Deno.env.get('VERISCAN_THRESHOLD') ?? '0.5')
    const bandStr = Deno.env.get('ABSTENTION_BAND') ?? '0.40,0.60'
    const [bandLow, bandHigh] = bandStr.split(',').map(Number)
    const vs = item.veriscan_score
    const vsAbstained = vs >= bandLow && vs <= bandHigh
    const vsJudgment = vsAbstained ? null : (vs >= threshold ? 'manipulated' : 'authentic')
    const veriscan_was_error = !vsAbstained && vsJudgment !== item.ground_truth

    // overrode_tool: null unless consulted AND tool gave a (non-abstaining) judgment
    const consulted = existing?.consulted ?? false
    const vjShown = existing?.veriscan_judgment_shown ?? null
    const vsAbstainedShown = existing?.veriscan_abstained ?? false
    const overrode_tool =
      consulted && !vsAbstainedShown && vjShown !== null
        ? final_judgment !== vjShown
        : null
    // override_correct: null when overrode_tool is null (not applicable)
    const override_correct = overrode_tool !== null ? (overrode_tool && correct) : null

    const committed_at = committed_at_ts
      ? new Date(committed_at_ts).toISOString()
      : new Date().toISOString()
    const presented_at = presented_at_ts ? new Date(presented_at_ts).toISOString() : null
    const time_on_item_ms =
      presented_at_ts && committed_at_ts ? committed_at_ts - presented_at_ts : null

    // Write responses row with all scoring fields
    await sb.from('responses').upsert(
      {
        participant_code,
        instance_id: participant.instance_id,
        phase: 1,
        item_id,
        presentation_index,
        group: participant.group,
        case_context: item.case_context,
        stakes_tag: item.stakes_tag,
        ground_truth: item.ground_truth,
        veriscan_was_error,
        final_judgment,
        committed_at,
        ...(presented_at && { presented_at }),
        ...(time_on_item_ms != null && { time_on_item_ms }),
        correct,
        item_score,
        overrode_tool,
        override_correct,
        rationale: rationaleValue,
      },
      { onConflict: 'participant_code,item_id,phase' },
    )

    // Update running part1_score and total_score
    const newScore = (participant.part1_score ?? 0) + item_score
    await sb
      .from('participants')
      .update({ part1_score: newScore, total_score: newScore + (participant.part2_score ?? 0) })
      .eq('participant_code', participant_code)

    // Log commit_judgment event with score_after
    await sb.from('events').insert({
      participant_code,
      instance_id: participant.instance_id,
      phase: 1,
      item_id,
      presentation_index,
      event_type: 'commit_judgment',
      payload: { final_judgment, correct, item_score },
      score_after: newScore,
      client_ts: committed_at_ts ? new Date(committed_at_ts).toISOString() : null,
    })

    return json({ ok: true, score: newScore })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
