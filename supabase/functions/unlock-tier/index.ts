import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TIER_LABELS = ['', 'Metadata', 'VeriScan Judgment', 'VeriScan Confidence', 'Explanation', 'Limitations']

interface ItemRow {
  veriscan_score: number
  ground_truth: string
  case_context: string
  stakes_tag: string
  p2_metadata: string | null
  p2_explanation: string | null
  p2_limitations: string | null
}

function deriveTierContent(tier: number, item: ItemRow): Record<string, unknown> {
  if (tier === 1) {
    return {
      label: 'Metadata',
      text: item.p2_metadata?.trim() || 'No metadata available for this item.',
    }
  }

  if (tier === 2) {
    const threshold = parseFloat(Deno.env.get('VERISCAN_THRESHOLD') ?? '0.5')
    const bandStr = Deno.env.get('ABSTENTION_BAND') ?? '0.40,0.60'
    const [bandLow, bandHigh] = bandStr.split(',').map(Number)
    const score = item.veriscan_score
    const abstained = score >= bandLow && score <= bandHigh
    const verdict = abstained ? 'uncertain' : (score >= threshold ? 'manipulated' : 'authentic')
    return {
      label: 'VeriScan Judgment',
      verdict,
      abstained,
      display: abstained
        ? 'Uncertain / cannot determine'
        : verdict === 'authentic' ? 'Authentic' : 'Manipulated',
    }
  }

  if (tier === 3) {
    const score = item.veriscan_score
    const bandStr = Deno.env.get('ABSTENTION_BAND') ?? '0.40,0.60'
    const [bandLow, bandHigh] = bandStr.split(',').map(Number)
    const abstained = score >= bandLow && score <= bandHigh
    let confidence: string | null = null
    if (!abstained) {
      const abs = Math.abs(score - 0.5)
      confidence = abs >= 0.40 ? 'High' : abs >= 0.15 ? 'Medium' : 'Low'
    }
    return {
      label: 'VeriScan Confidence',
      confidence,
      display: confidence ?? 'N/A (uncertain judgment)',
    }
  }

  if (tier === 4) {
    return {
      label: 'Explanation',
      text: item.p2_explanation?.trim() || 'No explanation provided for this item.',
    }
  }

  // tier === 5
  return {
    label: 'Limitations',
    text: item.p2_limitations?.trim() || 'No limitations note provided for this item.',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { participant_code, item_id, tier, presentation_index, client_ts } = await req.json()

    if (!participant_code || item_id == null || tier == null || presentation_index == null) {
      return json({ error: 'participant_code, item_id, tier, and presentation_index are required' }, 400)
    }

    if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
      return json({ error: 'tier must be an integer 1–5' }, 400)
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

    // Get existing responses row for this phase-2 item (unlock state)
    const { data: existing } = await sb
      .from('responses')
      .select('unlock_sequence, unlocks_purchased')
      .eq('participant_code', participant_code)
      .eq('item_id', item_id)
      .eq('phase', 2)
      .maybeSingle()

    const currentSeq: number[] = Array.isArray(existing?.unlock_sequence) ? existing.unlock_sequence as number[] : []

    // Fetch item — server-only fields (veriscan_score, ground_truth, tier text) never leave server
    const { data: item, error: iErr } = await sb
      .from('items')
      .select('veriscan_score, ground_truth, case_context, stakes_tag, p2_metadata, p2_explanation, p2_limitations')
      .eq('id', item_id)
      .single()
    if (iErr || !item) return json({ error: 'Item not found' }, 404)

    // Idempotency: already unlocked — return content without charging
    if (currentSeq.includes(tier)) {
      const content = deriveTierContent(tier, item as ItemRow)
      const total_score = (participant.part1_score ?? 0) + (participant.part2_score ?? 0)
      return json({ ok: true, tier, content, total_score, charged: false })
    }

    // Sequential validation: all tiers before this one must already be unlocked
    for (let t = 1; t < tier; t++) {
      if (!currentSeq.includes(t)) {
        return json({ error: `Tier ${t} must be unlocked before tier ${tier}` }, 400)
      }
    }

    const content = deriveTierContent(tier, item as ItemRow)

    // Charge −2
    const newPart2Score = (participant.part2_score ?? 0) - 2
    const newTotalScore = (participant.part1_score ?? 0) + newPart2Score

    await sb
      .from('participants')
      .update({ part2_score: newPart2Score, total_score: newTotalScore })
      .eq('participant_code', participant_code)

    const newSeq = [...currentSeq, tier]
    const newUnlocksPurchased = (existing?.unlocks_purchased ?? 0) + 1

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
        unlock_sequence: newSeq,
        unlocks_purchased: newUnlocksPurchased,
      },
      { onConflict: 'participant_code,item_id,phase' },
    )

    await sb.from('events').insert({
      participant_code,
      instance_id: participant.instance_id,
      phase: 2,
      item_id,
      presentation_index,
      event_type: 'unlock',
      payload: { tier, tier_label: TIER_LABELS[tier] },
      score_after: newTotalScore,
      client_ts: client_ts ? new Date(client_ts).toISOString() : null,
    })

    return json({ ok: true, tier, content, total_score: newTotalScore, charged: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
