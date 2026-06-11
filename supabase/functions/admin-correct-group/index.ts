// Admin: look up a participant by code; optionally correct their group.
// JWT required — do NOT deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function requireAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const uid = await requireAuth(req)
  if (!uid) return json({ error: 'Unauthorized' }, 401)

  try {
    const { instance_id, participant_code, new_group } = await req.json()
    if (!instance_id || !participant_code) {
      return json({ error: 'instance_id and participant_code are required' }, 400)
    }
    if (new_group !== undefined && !['A', 'B', 'C'].includes(new_group)) {
      return json({ error: 'new_group must be A, B, or C' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [{ data: participant, error: pErr }, { count }] = await Promise.all([
      sb.from('participants')
        .select('participant_code, group, status, consented_research, started_at')
        .eq('instance_id', instance_id)
        .eq('participant_code', participant_code)
        .single(),
      sb.from('responses')
        .select('*', { count: 'exact', head: true })
        .eq('participant_code', participant_code),
    ])

    if (pErr || !participant) return json({ error: 'Participant not found in this instance' }, 404)

    if (new_group) {
      const { error: uErr } = await sb
        .from('participants')
        .update({ group: new_group })
        .eq('participant_code', participant_code)
      if (uErr) return json({ error: uErr.message }, 500)

      return json({
        participant_code: participant.participant_code,
        group: new_group,
        status: participant.status,
        consented_research: participant.consented_research,
        started_at: participant.started_at,
        response_count: count ?? 0,
        updated: true,
      })
    }

    return json({
      participant_code: participant.participant_code,
      group: participant.group,
      status: participant.status,
      consented_research: participant.consented_research,
      started_at: participant.started_at,
      response_count: count ?? 0,
      updated: false,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
