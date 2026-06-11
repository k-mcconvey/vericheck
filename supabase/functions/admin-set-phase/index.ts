// Admin: set session phase and/or leaderboard reveal state.
// JWT required — do NOT deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const VALID_PHASES = ['landing', 'consent', 'demographics', 'group_select', 'part1', 'break', 'part2', 'results']

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
    const { instance_id, phase, leaderboard_revealed } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)
    if (phase !== undefined && !VALID_PHASES.includes(phase)) {
      return json({ error: `Invalid phase. Must be one of: ${VALID_PHASES.join(', ')}` }, 400)
    }
    if (phase === undefined && leaderboard_revealed === undefined) {
      return json({ error: 'Provide phase or leaderboard_revealed to update' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (phase !== undefined) updates.current_phase = phase
    if (leaderboard_revealed !== undefined) updates.leaderboard_revealed = leaderboard_revealed

    const { error } = await sb
      .from('session_state')
      .update(updates)
      .eq('instance_id', instance_id)

    if (error) return json({ error: error.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
