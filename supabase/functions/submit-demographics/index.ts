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
    const body = await req.json()
    const { participant_code, role, field_domain, ai_familiarity, legal_exposure, prior_ai_research } = body

    if (!participant_code) return json({ error: 'participant_code is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await sb.from('demographics').upsert({
      participant_code,
      role: role ?? null,
      field_domain: field_domain ?? null,
      ai_familiarity: ai_familiarity ?? null,
      legal_exposure: legal_exposure ?? null,
      prior_ai_research: prior_ai_research ?? null,
    })

    if (error) return json({ error: error.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
