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
      .select('instance_id, group')
      .eq('participant_code', participant_code)
      .single()
    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    // Idempotency: if already committed, return success without re-writing
    const { data: existing } = await sb
      .from('responses')
      .select('final_judgment')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 1)
      .maybeSingle()

    if (existing?.final_judgment) {
      return json({ ok: true })
    }

    // Fetch item context server-side for completeness if responses row doesn't exist yet
    const { data: item } = await sb
      .from('items')
      .select('case_context, stakes_tag, ground_truth')
      .eq('id', item_id)
      .single()

    const committed_at = committed_at_ts
      ? new Date(committed_at_ts).toISOString()
      : new Date().toISOString()
    const presented_at = presented_at_ts ? new Date(presented_at_ts).toISOString() : null
    const time_on_item_ms =
      presented_at_ts && committed_at_ts ? committed_at_ts - presented_at_ts : null

    // Upsert responses row with judgment fields
    // Pass A: correct, item_score, overrode_tool, override_correct left null (computed in Pass B)
    await sb.from('responses').upsert(
      {
        participant_code,
        instance_id: participant.instance_id,
        phase: 1,
        item_id,
        presentation_index,
        group: participant.group,
        ...(item && {
          case_context: item.case_context,
          stakes_tag: item.stakes_tag,
          ground_truth: item.ground_truth,
        }),
        final_judgment,
        committed_at,
        ...(presented_at && { presented_at }),
        ...(time_on_item_ms != null && { time_on_item_ms }),
      },
      { onConflict: 'participant_code,item_id,phase' },
    )

    // Log commit_judgment event
    await sb.from('events').insert({
      participant_code,
      instance_id: participant.instance_id,
      phase: 1,
      item_id,
      presentation_index,
      event_type: 'commit_judgment',
      payload: { final_judgment },
      client_ts: committed_at_ts ? new Date(committed_at_ts).toISOString() : null,
    })

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
