import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Mulberry32-based seeded Fisher-Yates shuffle.
// Must produce identical output for a given seed across Edge Function invocations.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s += 0x6D2B79F5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    const rand = ((z ^ (z >>> 14)) >>> 0) / 4294967296
    const j = Math.floor(rand * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { participant_code } = await req.json()
    if (!participant_code) return json({ error: 'participant_code required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('order_seed, group')
      .eq('participant_code', participant_code)
      .single()

    if (pErr || !participant) return json({ error: 'Participant not found' }, 404)

    // Display-safe fields only — ground_truth, veriscan_score, detector_regime never leave server
    const { data: items, error: iErr } = await sb
      .from('items')
      .select('id, image_filename, type, family, case_context, stakes_tag')
      .eq('phase', '1')
      .order('id')

    if (iErr || !items) return json({ error: 'Failed to fetch items' }, 500)

    const shuffled = seededShuffle(items, participant.order_seed)
    const ordered = shuffled.map((item, idx) => ({ ...item, presentation_index: idx }))

    return json({ items: ordered, group: participant.group, total: ordered.length })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
