// Admin: permanently delete ALL participant data for an instance and reset its session state.
// Requires confirm_instance === instance_id to proceed.
// Touches the emails table only when delete_emails === true.
// Keeps session_state.min_item_seconds (the dwell timer setting).
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
    const { instance_id, confirm_instance, delete_emails } = await req.json()
    if (!instance_id || !confirm_instance) {
      return json({ error: 'instance_id and confirm_instance are required' }, 400)
    }
    if (confirm_instance !== instance_id) {
      return json({ error: 'Confirmation does not match. Re-type the exact instance name.' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { count: participantCount, error: cErr } = await sb
      .from('participants')
      .select('participant_code', { count: 'exact', head: true })
      .eq('instance_id', instance_id)
    if (cErr) return json({ error: cErr.message }, 500)

    // Children before parent; demographics cascades from participants
    const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ['responses', () => sb.from('responses').delete().eq('instance_id', instance_id)],
      ['events', () => sb.from('events').delete().eq('instance_id', instance_id)],
      ['participants', () => sb.from('participants').delete().eq('instance_id', instance_id)],
    ]
    if (delete_emails === true) {
      steps.push(['emails', () => sb.from('emails').delete().eq('instance_id', instance_id)])
    }
    for (const [table, run] of steps) {
      const { error } = await run()
      if (error) return json({ error: `Failed deleting from ${table}: ${error.message}` }, 500)
    }

    const { error: sErr } = await sb
      .from('session_state')
      .update({ current_phase: 'landing', leaderboard_revealed: false, updated_at: new Date().toISOString() })
      .eq('instance_id', instance_id)
    if (sErr) return json({ error: `Data deleted, but session reset failed: ${sErr.message}` }, 500)

    // Audit log: action + instance only
    await sb.from('admin_log').insert({
      action: delete_emails === true ? 'reset_instance_with_emails' : 'reset_instance',
      instance_id,
    })

    return json({ ok: true, deleted_participants: participantCount ?? 0, emails_deleted: delete_emails === true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
