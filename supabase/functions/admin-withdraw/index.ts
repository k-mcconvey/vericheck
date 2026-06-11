// Admin: permanently delete all rows for a participant code.
// Requires confirm_code === participant_code to proceed.
// NEVER touches the emails table.
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
    const { instance_id, participant_code, confirm_code } = await req.json()
    if (!instance_id || !participant_code || !confirm_code) {
      return json({ error: 'instance_id, participant_code, and confirm_code are required' }, 400)
    }
    if (confirm_code !== participant_code) {
      return json({ error: 'Confirmation code does not match. Re-type the exact participant code.' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the participant exists in this instance before deleting
    const { data: participant, error: pErr } = await sb
      .from('participants')
      .select('participant_code, status')
      .eq('instance_id', instance_id)
      .eq('participant_code', participant_code)
      .single()

    if (pErr || !participant) {
      return json({ error: 'Participant not found in this instance' }, 404)
    }

    // Delete in dependency order (children before parent)
    const deleteSteps = [
      sb.from('responses').delete().eq('participant_code', participant_code),
      sb.from('events').delete().eq('participant_code', participant_code),
    ]
    await Promise.all(deleteSteps)
    await sb.from('demographics').delete().eq('participant_code', participant_code)
    await sb.from('participants').delete().eq('participant_code', participant_code)

    // Audit log: code + timestamp only; no other identifying info
    await sb.from('admin_log').insert({
      action: 'withdraw',
      target_code: participant_code,
      instance_id,
    })

    return json({ ok: true, deleted_code: participant_code })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
