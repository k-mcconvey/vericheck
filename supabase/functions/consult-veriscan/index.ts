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

    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('instance_id, group')
      .eq('participant_code', participant_code)
      .single()
    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    if (!['B', 'C'].includes(participant.group)) {
      return json({ error: 'Only Groups B and C may consult VeriScan' }, 403)
    }

    // Idempotency: if already consulted, return the stored result without re-charging
    const { data: existing } = await sb
      .from('responses')
      .select('consulted, veriscan_judgment_shown, veriscan_abstained, veriscan_score_shown')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 1)
      .maybeSingle()

    if (existing?.consulted === true) {
      const score = existing.veriscan_score_shown ?? 0
      const abs = Math.abs(score - 0.5)
      const confidence = existing.veriscan_abstained
        ? null
        : (abs >= 0.40 ? 'High' : abs >= 0.15 ? 'Medium' : 'Low')
      return json({
        verdict: existing.veriscan_abstained ? 'uncertain' : existing.veriscan_judgment_shown,
        abstained: existing.veriscan_abstained ?? false,
        confidence,
      })
    }

    // Fetch veriscan_score and ground_truth — server-only fields, never sent to browser
    const { data: item, error: iErr } = await sb
      .from('items')
      .select('veriscan_score, ground_truth, case_context, stakes_tag')
      .eq('id', item_id)
      .single()
    if (iErr || !item) return json({ error: 'Item not found' }, 404)

    // Derive verdict from config (threshold + abstention band)
    const threshold = parseFloat(Deno.env.get('VERISCAN_THRESHOLD') ?? '0.5')
    const bandStr = Deno.env.get('ABSTENTION_BAND') ?? '0.40,0.60'
    const [bandLow, bandHigh] = bandStr.split(',').map(Number)

    const score = item.veriscan_score
    const abstained = score >= bandLow && score <= bandHigh
    const judgment: string | null = abstained ? null : (score >= threshold ? 'manipulated' : 'authentic')
    const was_error = !abstained && judgment !== item.ground_truth

    // Qualitative confidence from distance to decision boundary (never send raw score)
    const abs = Math.abs(score - 0.5)
    const confidence = abstained ? null : (abs >= 0.40 ? 'High' : abs >= 0.15 ? 'Medium' : 'Low')

    // Upsert responses row with consult fields (creates row if log-item-presented wasn't called yet)
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
        consulted: true,
        veriscan_score_shown: score,      // stored in DB for research; never returned to browser
        veriscan_judgment_shown: judgment,
        veriscan_abstained: abstained,
        veriscan_was_error: was_error,
      },
      { onConflict: 'participant_code,item_id,phase' },
    )

    // Log consult event
    await sb.from('events').insert({
      participant_code,
      instance_id: participant.instance_id,
      phase: 1,
      item_id,
      presentation_index,
      event_type: 'consult',
      payload: { veriscan_judgment_shown: judgment, abstained, was_error },
      client_ts: client_ts ? new Date(client_ts).toISOString() : null,
    })

    // Return verdict and confidence only — raw score and ground_truth stay server-side
    return json({
      verdict: abstained ? 'uncertain' : judgment,
      abstained,
      confidence,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
