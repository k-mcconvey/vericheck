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
    const { participant_code, instance_id } = await req.json()

    if (!participant_code || !instance_id) {
      return json({ error: 'participant_code and instance_id are required' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotent: return existing assignment without re-assigning
    const { data: participant, error: fetchError } = await sb
      .from('participants')
      .select('group')
      .eq('participant_code', participant_code)
      .single()

    if (fetchError) return json({ error: fetchError.message }, 500)
    if (participant?.group) return json({ group: participant.group })

    // Count current assignments per group for this instance
    const { data: rows, error: countError } = await sb
      .from('participants')
      .select('group')
      .eq('instance_id', instance_id)
      .in('group', ['A', 'B', 'C'])

    if (countError) return json({ error: countError.message }, 500)

    const tally = { A: 0, B: 0, C: 0 }
    for (const row of (rows ?? [])) {
      if (row.group === 'A' || row.group === 'B' || row.group === 'C') {
        tally[row.group]++
      }
    }

    // Assign to the group with the fewest members; break ties randomly
    const min = Math.min(tally.A, tally.B, tally.C)
    const candidates = (['A', 'B', 'C'] as const).filter((g) => tally[g] === min)
    const group = candidates[Math.floor(Math.random() * candidates.length)]

    const { error: updateError } = await sb
      .from('participants')
      .update({ group })
      .eq('participant_code', participant_code)

    if (updateError) return json({ error: updateError.message }, 500)

    return json({ group })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
