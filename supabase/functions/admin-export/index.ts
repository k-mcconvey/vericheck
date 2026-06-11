// Admin: CSV exports for responses, events, participants_summary, dissemination_emails.
// JWT required — do NOT deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Content-Disposition',
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

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const uid = await requireAuth(req)
  if (!uid) return json({ error: 'Unauthorized' }, 401)

  try {
    const { instance_id, export_type, include_excluded } = await req.json()
    if (!instance_id) return json({ error: 'instance_id is required' }, 400)

    const VALID_TYPES = ['responses', 'events', 'participants_summary', 'dissemination_emails']
    if (!VALID_TYPES.includes(export_type)) {
      return json({ error: `export_type must be one of: ${VALID_TYPES.join(', ')}` }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let csv = ''
    const filename = `${export_type}_${instance_id}_${new Date().toISOString().slice(0, 10)}.csv`

    if (export_type === 'responses') {
      const [{ data: participants }, { data: responses, error: rErr }] = await Promise.all([
        sb.from('participants').select('participant_code, consented_research, population_label').eq('instance_id', instance_id),
        sb.from('responses').select('*').eq('instance_id', instance_id).order('participant_code').order('phase').order('presentation_index'),
      ])
      if (rErr) return json({ error: rErr.message }, 500)

      const pMap = new Map((participants ?? []).map(p => [p.participant_code, p]))
      const rows = (responses ?? [])
        .filter(r => include_excluded || pMap.get(r.participant_code)?.consented_research === true)
        .map(r => {
          const p = pMap.get(r.participant_code)
          return { instance_id, population_label: p?.population_label ?? '', consented_research: p?.consented_research ?? false, ...r }
        })
      csv = toCSV(rows)

    } else if (export_type === 'events') {
      const { data: rows, error: eErr } = await sb.from('events').select('*').eq('instance_id', instance_id).order('server_ts')
      if (eErr) return json({ error: eErr.message }, 500)
      csv = toCSV(rows ?? [])

    } else if (export_type === 'participants_summary') {
      const { data: participants, error: pErr } = await sb.from('participants').select('*').eq('instance_id', instance_id).order('started_at')
      if (pErr) return json({ error: pErr.message }, 500)

      const pcodes = (participants ?? []).map(p => p.participant_code)
      let demoMap: Map<string, Record<string, unknown>> = new Map()
      if (pcodes.length > 0) {
        const { data: demos } = await sb.from('demographics').select('*').in('participant_code', pcodes)
        demoMap = new Map((demos ?? []).map(d => [d.participant_code as string, d]))
      }

      const rows = (participants ?? []).map(p => ({ ...p, ...(demoMap.get(p.participant_code) ?? {}) }))
      csv = toCSV(rows)

    } else if (export_type === 'dissemination_emails') {
      const { data: rows, error: eErr } = await sb.from('emails').select('*').eq('instance_id', instance_id).order('created_at')
      if (eErr) return json({ error: eErr.message }, 500)
      csv = toCSV(rows ?? [])
    }

    return new Response(csv, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
