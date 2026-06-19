// Admin: set the per-item minimum dwell time for a session instance.
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
    const { instance_id, min_item_seconds } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    // null = reset to deployment default; integer 0–600 = explicit value (0 disables the timer)
    const effectiveValue: number | null = min_item_seconds ?? null
    if (effectiveValue !== null) {
      if (!Number.isInteger(effectiveValue) || effectiveValue < 0 || effectiveValue > 600) {
        return json({ error: 'min_item_seconds must be null or an integer 0–600' }, 400)
      }
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error: uErr } = await sb
      .from('session_state')
      .update({ min_item_seconds: effectiveValue, updated_at: new Date().toISOString() })
      .eq('instance_id', instance_id)

    if (uErr) return json({ error: uErr.message }, 500)

    // Audit log — target_code stores the new value as a string for readability
    await sb.from('admin_log').insert({
      action: 'set_timer',
      instance_id,
      target_code: effectiveValue !== null ? String(effectiveValue) : 'null',
    })

    return json({ ok: true, min_item_seconds: effectiveValue })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
