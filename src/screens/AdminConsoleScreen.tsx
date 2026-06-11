import { useState, useEffect } from 'react'
import { supabase } from '../data/dataClient'
import * as dc from '../data/dataClient'

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminTab = 'control' | 'monitor' | 'participants' | 'leaderboard' | 'exports'

const PHASES = [
  'landing', 'consent', 'demographics', 'group_select',
  'part1', 'break', 'part2', 'results',
] as const
type Phase = typeof PHASES[number]

const PHASE_LABELS: Record<Phase, string> = {
  landing: 'Landing',
  consent: 'Consent',
  demographics: 'Demographics',
  group_select: 'Group Select',
  part1: 'Part 1',
  break: 'Break',
  part2: 'Part 2',
  results: 'Results',
}

interface MonitorData {
  total: number
  by_status: { in_progress: number; completed: number; withdrawn: number; incomplete: number }
  by_group: { A: number; B: number; C: number; unset: number }
  part1_active: number
  part2_active: number
}

interface ParticipantInfo {
  participant_code: string
  group: string | null
  status: string
  consented_research: boolean
  started_at: string | null
  response_count: number
}

// ── Root component ─────────────────────────────────────────────────────────────

interface Props {
  onSignOut: () => void
}

export default function AdminConsoleScreen({ onSignOut }: Props) {
  const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'
  const [tab, setTab] = useState<AdminTab>('control')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ''))
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    onSignOut()
  }

  const TAB_LABELS: Record<AdminTab, string> = {
    control: 'Phase Control',
    monitor: 'Monitor',
    participants: 'Participants',
    leaderboard: 'Leaderboard',
    exports: 'Exports',
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header-left">
          <span className="admin-title">VeriCheck Admin</span>
          <span className="admin-instance-badge">{instanceId}</span>
        </div>
        <div className="admin-header-right">
          {userEmail && <span className="admin-user-email">{userEmail}</span>}
          <button
            className="btn btn-secondary"
            onClick={handleSignOut}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="admin-tab-bar">
        {(Object.keys(TAB_LABELS) as AdminTab[]).map(t => (
          <button
            key={t}
            className={`admin-tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="admin-panel">
        {tab === 'control' && <ControlTab instanceId={instanceId} />}
        {tab === 'monitor' && <MonitorTab instanceId={instanceId} />}
        {tab === 'participants' && <ParticipantsTab instanceId={instanceId} />}
        {tab === 'leaderboard' && <LeaderboardTab instanceId={instanceId} />}
        {tab === 'exports' && <ExportsTab instanceId={instanceId} />}
      </div>
    </div>
  )
}

// ── Phase Control tab ─────────────────────────────────────────────────────────

function ControlTab({ instanceId }: { instanceId: string }) {
  const [phase, setPhase] = useState<Phase | null>(null)
  const [lbRevealed, setLbRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase
      .from('session_state')
      .select('current_phase, leaderboard_revealed')
      .eq('instance_id', instanceId)
      .single()
      .then(({ data }) => {
        if (data) {
          setPhase(data.current_phase as Phase)
          setLbRevealed(!!data.leaderboard_revealed)
        }
        setLoading(false)
      })

    const ch = supabase
      .channel(`admin-ctrl-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_state', filter: `instance_id=eq.${instanceId}` },
        (payload) => {
          setPhase(payload.new.current_phase as Phase)
          setLbRevealed(!!payload.new.leaderboard_revealed)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [instanceId])

  async function setPhaseAction(p: Phase) {
    setError(''); setMsg(''); setBusy(true)
    const result = await dc.adminSetPhase(instanceId, p)
    setBusy(false)
    if ('error' in result) setError(result.error)
    else setMsg(`Phase set to "${PHASE_LABELS[p]}"`)
  }

  async function toggleLeaderboard() {
    setError(''); setMsg(''); setBusy(true)
    const next = !lbRevealed
    const result = await dc.adminToggleLeaderboard(instanceId, next)
    setBusy(false)
    if ('error' in result) setError(result.error)
    else setMsg(next ? 'Leaderboard revealed to participants.' : 'Leaderboard hidden.')
  }

  if (loading) return <p className="prose" style={{ padding: '1rem 0' }}>Loading session state…</p>

  return (
    <div>
      {error && <div className="error-banner" style={{ marginBottom: '1.25rem' }}>{error}</div>}
      {msg && <div className="admin-msg-banner">{msg}</div>}

      <div className="card">
        <div className="section-label">Current Phase</div>
        <div className="admin-current-value">
          {phase ? PHASE_LABELS[phase] : <span style={{ color: '#475569' }}>—</span>}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Set Phase</div>
        <div className="admin-phase-grid">
          {PHASES.map(p => (
            <button
              key={p}
              className={`admin-phase-btn${phase === p ? ' active' : ''}`}
              onClick={() => setPhaseAction(p)}
              disabled={busy}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Leaderboard</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <span className="prose">
            Currently: <strong style={{ color: lbRevealed ? '#34d399' : '#f59e0b' }}>
              {lbRevealed ? 'Revealed' : 'Hidden'}
            </strong>
          </span>
          <button
            className={`btn ${lbRevealed ? 'btn-secondary' : 'btn-primary'}`}
            onClick={toggleLeaderboard}
            disabled={busy}
          >
            {lbRevealed ? 'Hide Leaderboard' : 'Reveal Leaderboard'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Monitor tab ────────────────────────────────────────────────────────────────

function MonitorTab({ instanceId }: { instanceId: string }) {
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    const result = await dc.adminGetMonitor(instanceId)
    setLoading(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      setData(result as MonitorData)
      setLastRefresh(new Date().toLocaleTimeString())
    }
  }

  useEffect(() => { refresh() }, [instanceId])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 className="screen-title" style={{ marginBottom: 0 }}>Live Monitor</h2>
        <button
          className="btn btn-secondary"
          onClick={refresh}
          disabled={loading}
          style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {lastRefresh && (
        <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1rem' }}>
          Last updated: {lastRefresh}
        </p>
      )}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <div className="card">
            <div className="section-label">By Status</div>
            <div className="admin-stat-grid">
              <AdminStat label="Total" value={data.total} />
              <AdminStat label="In Progress" value={data.by_status.in_progress} />
              <AdminStat label="Completed" value={data.by_status.completed} />
              <AdminStat label="Withdrawn" value={data.by_status.withdrawn} />
            </div>
          </div>
          <div className="card">
            <div className="section-label">By Group</div>
            <div className="admin-stat-grid">
              <AdminStat label="Group A" value={data.by_group.A} />
              <AdminStat label="Group B" value={data.by_group.B} />
              <AdminStat label="Group C" value={data.by_group.C} />
              <AdminStat label="No Group" value={data.by_group.unset} />
            </div>
          </div>
          <div className="card">
            <div className="section-label">Phase Activity</div>
            <div className="admin-stat-grid">
              <AdminStat label="Part 1 Active" value={data.part1_active} />
              <AdminStat label="Part 2 Active" value={data.part2_active} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  )
}

// ── Participants tab (Group Correction + Withdraw) ─────────────────────────────

function ParticipantsTab({ instanceId }: { instanceId: string }) {
  // Group correction
  const [gcCode, setGcCode] = useState('')
  const [gcInfo, setGcInfo] = useState<ParticipantInfo | null>(null)
  const [gcError, setGcError] = useState('')
  const [gcBusy, setGcBusy] = useState(false)
  const [gcNewGroup, setGcNewGroup] = useState<'A' | 'B' | 'C' | ''>('')
  const [gcMsg, setGcMsg] = useState('')

  // Withdraw
  const [wdCode, setWdCode] = useState('')
  const [wdInfo, setWdInfo] = useState<ParticipantInfo | null>(null)
  const [wdError, setWdError] = useState('')
  const [wdBusy, setWdBusy] = useState(false)
  const [wdConfirm, setWdConfirm] = useState('')
  const [wdMsg, setWdMsg] = useState('')

  async function gcLookup() {
    setGcError(''); setGcMsg(''); setGcInfo(null); setGcNewGroup(''); setGcBusy(true)
    const result = await dc.adminLookupParticipant(instanceId, gcCode.trim().toUpperCase())
    setGcBusy(false)
    if ('error' in result) setGcError(result.error)
    else setGcInfo(result as ParticipantInfo)
  }

  async function gcApply() {
    if (!gcNewGroup || !gcInfo) return
    setGcError(''); setGcMsg(''); setGcBusy(true)
    const result = await dc.adminCorrectGroup(instanceId, gcInfo.participant_code, gcNewGroup)
    setGcBusy(false)
    if ('error' in result) setGcError(result.error)
    else {
      setGcInfo({ ...(result as ParticipantInfo) })
      setGcNewGroup('')
      setGcMsg(`Group updated to ${gcNewGroup}.`)
    }
  }

  async function wdLookup() {
    setWdError(''); setWdMsg(''); setWdInfo(null); setWdConfirm(''); setWdBusy(true)
    const result = await dc.adminLookupParticipant(instanceId, wdCode.trim().toUpperCase())
    setWdBusy(false)
    if ('error' in result) setWdError(result.error)
    else setWdInfo(result as ParticipantInfo)
  }

  async function wdExecute() {
    if (!wdInfo) return
    setWdError(''); setWdBusy(true)
    const result = await dc.adminWithdraw(instanceId, wdInfo.participant_code, wdConfirm.trim().toUpperCase())
    setWdBusy(false)
    if ('error' in result) {
      setWdError(result.error)
    } else {
      setWdMsg(`Participant ${wdInfo.participant_code} withdrawn. All their data has been permanently deleted.`)
      setWdInfo(null); setWdCode(''); setWdConfirm('')
    }
  }

  return (
    <div>
      {/* ── Group Correction ── */}
      <h2 className="screen-title">Group Correction</h2>
      <div className="card">
        {gcError && <div className="error-banner" style={{ marginBottom: '1rem' }}>{gcError}</div>}
        {gcMsg && <div className="admin-msg-banner">{gcMsg}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: gcInfo ? '1rem' : 0 }}>
          <input
            type="text"
            className="admin-code-input"
            placeholder="Participant code"
            value={gcCode}
            onChange={e => setGcCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && gcCode && gcLookup()}
          />
          <button className="btn btn-primary" onClick={gcLookup} disabled={gcBusy || !gcCode}>
            {gcBusy ? '…' : 'Look Up'}
          </button>
        </div>
        {gcInfo && (
          <>
            <ParticipantPreview info={gcInfo} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <span className="section-label" style={{ marginBottom: 0 }}>New group:</span>
              {(['A', 'B', 'C'] as const).map(g => (
                <button
                  key={g}
                  className={`btn ${gcNewGroup === g ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ minWidth: '2.75rem', padding: '0.45rem 0.75rem' }}
                  onClick={() => setGcNewGroup(g)}
                >
                  {g}
                </button>
              ))}
              <button
                className="btn btn-primary"
                onClick={gcApply}
                disabled={gcBusy || !gcNewGroup || gcNewGroup === gcInfo.group}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Withdraw Participant ── */}
      <h2 className="screen-title" style={{ marginTop: '2rem' }}>Withdraw Participant</h2>
      <div className="card">
        {wdError && <div className="error-banner" style={{ marginBottom: '1rem' }}>{wdError}</div>}
        {wdMsg && <div className="admin-msg-banner">{wdMsg}</div>}

        {!wdInfo ? (
          <>
            <p className="prose" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Enter a participant code to preview what will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                className="admin-code-input"
                placeholder="Participant code"
                value={wdCode}
                onChange={e => setWdCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && wdCode && wdLookup()}
              />
              <button className="btn btn-primary" onClick={wdLookup} disabled={wdBusy || !wdCode}>
                {wdBusy ? '…' : 'Preview'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="admin-danger-box">
              <p style={{ fontWeight: 700, color: '#fca5a5', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                Permanently deletes:
              </p>
              <ParticipantPreview info={wdInfo} />
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>
                Removes rows from <code>participants</code>, <code>demographics</code>,{' '}
                <code>responses</code>, and <code>events</code>. The{' '}
                <code>emails</code> table is NOT touched.
              </p>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Re-type the participant code to confirm:
              </label>
              <input
                type="text"
                className="admin-code-input"
                style={{ border: '1px solid #7f1d1d', marginBottom: '0.75rem' }}
                placeholder="Type code to confirm"
                value={wdConfirm}
                onChange={e => setWdConfirm(e.target.value.toUpperCase())}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setWdInfo(null); setWdCode(''); setWdConfirm(''); setWdError('') }}
                >
                  Cancel
                </button>
                <button
                  className="btn admin-btn-danger"
                  style={{ flex: 1 }}
                  onClick={wdExecute}
                  disabled={wdBusy || wdConfirm !== wdInfo.participant_code}
                >
                  {wdBusy ? 'Deleting…' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ParticipantPreview({ info }: { info: ParticipantInfo }) {
  return (
    <div className="admin-preview-table">
      <div className="admin-preview-row">
        <span className="admin-preview-label">Code</span>
        <span className="admin-preview-value" style={{ fontFamily: 'ui-monospace, monospace', color: '#38bdf8' }}>
          {info.participant_code}
        </span>
      </div>
      <div className="admin-preview-row">
        <span className="admin-preview-label">Group</span>
        <span className="admin-preview-value">{info.group || <em style={{ color: '#475569' }}>unset</em>}</span>
      </div>
      <div className="admin-preview-row">
        <span className="admin-preview-label">Status</span>
        <span className="admin-preview-value">{info.status}</span>
      </div>
      <div className="admin-preview-row">
        <span className="admin-preview-label">Consent</span>
        <span className="admin-preview-value">{info.consented_research ? 'Research' : 'Exercise only'}</span>
      </div>
      <div className="admin-preview-row">
        <span className="admin-preview-label">Responses</span>
        <span className="admin-preview-value">{info.response_count} rows</span>
      </div>
      {info.started_at && (
        <div className="admin-preview-row">
          <span className="admin-preview-label">Started</span>
          <span className="admin-preview-value" style={{ fontSize: '0.82rem' }}>
            {new Date(info.started_at).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Leaderboard tab ────────────────────────────────────────────────────────────

function LeaderboardTab({ instanceId }: { instanceId: string }) {
  const [data, setData] = useState<dc.LeaderboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    const result = await dc.adminGetLeaderboard(instanceId)
    setLoading(false)
    if ('error' in result) setError(result.error)
    else setData(result as dc.LeaderboardData)
  }

  useEffect(() => { load() }, [instanceId])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 className="screen-title" style={{ marginBottom: 0 }}>Leaderboard</h2>
        <button
          className="btn btn-secondary"
          onClick={load}
          disabled={loading}
          style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <LeaderboardCategory
            title="Top Scorers"
            rows={data.top_scorers}
            renderMetric={e => `${e.total_score} pts`}
          />
          <LeaderboardCategory
            title="Most Accurate"
            rows={data.most_accurate}
            renderMetric={e => `${Math.round((e as { accuracy: number }).accuracy * 100)}% (${(e as { correct: number }).correct}/${(e as { total: number }).total})`}
          />
          <LeaderboardCategory
            title="Best Error Catchers"
            rows={data.best_error_catchers}
            renderMetric={e => `${(e as { errors_caught: number }).errors_caught} caught`}
          />
        </>
      )}
    </div>
  )
}

function LeaderboardCategory({
  title,
  rows,
  renderMetric,
}: {
  title: string
  rows: Array<{ participant_code: string } & Record<string, unknown>>
  renderMetric: (row: { participant_code: string } & Record<string, unknown>) => string
}) {
  return (
    <div className="card">
      <div className="section-label">{title}</div>
      {rows.length === 0 ? (
        <p className="prose" style={{ fontSize: '0.85rem', color: '#475569' }}>No data yet.</p>
      ) : (
        rows.map((row, i) => (
          <div key={row.participant_code} className="res-lb-row">
            <span className="res-lb-rank">#{i + 1}</span>
            <span className="res-lb-code">{row.participant_code}</span>
            <span className="res-lb-metric">{renderMetric(row)}</span>
          </div>
        ))
      )}
    </div>
  )
}

// ── Exports tab ────────────────────────────────────────────────────────────────

const EXPORT_DEFS = [
  {
    type: 'responses',
    label: 'Responses',
    desc: 'Wide per-participant × item. Filtered to consented participants by default.',
    hasExcludedToggle: true,
  },
  {
    type: 'events',
    label: 'Events Log',
    desc: 'Raw append-only event log.',
    hasExcludedToggle: false,
  },
  {
    type: 'participants_summary',
    label: 'Participants Summary',
    desc: 'One row per participant with joined demographics and scores.',
    hasExcludedToggle: false,
  },
  {
    type: 'dissemination_emails',
    label: 'Dissemination Emails',
    desc: 'Isolated opt-in email list only. Never joined to research data.',
    hasExcludedToggle: false,
  },
] as const

function ExportsTab({ instanceId }: { instanceId: string }) {
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function download(exportType: string) {
    setError(''); setBusy(exportType)
    const result = await dc.adminExport(
      instanceId,
      exportType,
      exportType === 'responses' ? includeExcluded : false,
    )
    setBusy(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    const blob = new Blob([result.csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportType}_${instanceId}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2 className="screen-title">Exports</h2>
      <p className="prose" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        All exports filtered to instance: <strong>{instanceId}</strong>.
        Includes <code>instance_id</code> and <code>population_label</code> columns.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {EXPORT_DEFS.map(({ type, label, desc, hasExcludedToggle }) => (
        <div key={type} className="admin-export-row card">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{desc}</div>
            {hasExcludedToggle && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={includeExcluded}
                  onChange={e => setIncludeExcluded(e.target.checked)}
                  style={{ accentColor: '#f59e0b' }}
                />
                <span style={{ color: '#f59e0b' }}>Include exercise-only participants (QA)</span>
              </label>
            )}
          </div>
          <button
            className="btn btn-primary"
            style={{ minWidth: '8rem', flexShrink: 0 }}
            onClick={() => download(type)}
            disabled={busy !== null}
          >
            {busy === type ? 'Preparing…' : 'Download'}
          </button>
        </div>
      ))}
    </div>
  )
}
