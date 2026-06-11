// Admin: live participant counts for the current instance.
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
    const { instance_id } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [
      { data: participants, error: pErr },
      { data: p1Rows, error: r1Err },
      { data: p2Rows, error: r2Err },
    ] = await Promise.all([
      sb.from('participants').select('participant_code, group, status').eq('instance_id', instance_id),
      sb.from('responses').select('participant_code').eq('instance_id', instance_id).eq('phase', 1),
      sb.from('responses').select('participant_code').eq('instance_id', instance_id).eq('phase', 2),
    ])

    if (pErr) return json({ error: pErr.message }, 500)
    if (r1Err) return json({ error: r1Err.message }, 500)
    if (r2Err) return json({ error: r2Err.message }, 500)

    const byStatus = { in_progress: 0, completed: 0, withdrawn: 0, incomplete: 0 }
    const byGroup: Record<string, number> = { A: 0, B: 0, C: 0, unset: 0 }

    for (const p of (participants ?? [])) {
      const s = p.status as keyof typeof byStatus
      if (s in byStatus) byStatus[s]++
      else byStatus.incomplete++

      const g = p.group ?? 'unset'
      byGroup[g] = (byGroup[g] ?? 0) + 1
    }

    const part1_active = new Set((p1Rows ?? []).map(r => r.participant_code)).size
    const part2_active = new Set((p2Rows ?? []).map(r => r.participant_code)).size

    return json({
      total: (participants ?? []).length,
      by_status: byStatus,
      by_group: { A: byGroup['A'] ?? 0, B: byGroup['B'] ?? 0, C: byGroup['C'] ?? 0, unset: byGroup['unset'] ?? 0 },
      part1_active,
      part2_active,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
