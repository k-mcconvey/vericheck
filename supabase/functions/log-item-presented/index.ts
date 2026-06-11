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
    const { participant_code, item_id, presentation_index, client_ts } = await req.json()

    if (!participant_code || item_id == null || presentation_index == null) {
      return json({ error: 'participant_code, item_id, and presentation_index are required' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch participant context
    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('instance_id, group')
      .eq('participant_code', participant_code)
      .single()
    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    // Fetch item context server-side (includes ground_truth — never sent to client)
    const { data: item, error: iErr } = await sb
      .from('items')
      .select('case_context, stakes_tag, ground_truth')
      .eq('id', item_id)
      .single()
    if (iErr || !item) return json({ error: 'Item not found' }, 404)

    const presented_at = client_ts ? new Date(client_ts).toISOString() : new Date().toISOString()

    // Idempotent upsert: create responses row but never overwrite an existing one
    // (row may already exist from a prior consult or if the client retries on refresh)
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
        presented_at,
      },
      { onConflict: 'participant_code,item_id,phase', ignoreDuplicates: true },
    )

    // Log item_presented event (idempotent: skip if already logged for this item)
    const { data: existing } = await sb
      .from('events')
      .select('id')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 1)
      .eq('event_type', 'item_presented')
      .maybeSingle()

    if (!existing) {
      await sb.from('events').insert({
        participant_code,
        instance_id: participant.instance_id,
        phase: 1,
        item_id,
        presentation_index,
        event_type: 'item_presented',
        payload: {},
        client_ts: client_ts ? new Date(client_ts).toISOString() : null,
      })
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
