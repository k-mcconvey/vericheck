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
    const { instance_id, population_label } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Generate collision-resistant code: VC + 6 chars (ambiguous chars removed)
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const randBytes = new Uint8Array(6)
    crypto.getRandomValues(randBytes)
    const participant_code = 'VC' + Array.from(randBytes).map(b => CHARS[b % CHARS.length]).join('')

    const seedArr = new Uint32Array(1)
    crypto.getRandomValues(seedArr)
    // Mask to [0, 2147483647] so the value fits PostgreSQL's signed integer type.
    // The mulberry32 shuffle in get-session-items uses >>> 0 (no-op for values ≤ 2^31-1),
    // so both functions derive identical item orders from the same seed.
    const order_seed = seedArr[0] & 0x7FFFFFFF

    const { error } = await sb.from('participants').insert({
      participant_code,
      instance_id,
      population_label: population_label ?? '',
      status: 'in_progress',
      order_seed,
    })

    if (error) return json({ error: error.message }, 500)

    return json({ participant_code, order_seed })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
