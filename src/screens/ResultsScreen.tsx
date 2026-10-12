import { useState, useEffect } from 'react'
import { supabase, getResults, getLeaderboard, type ResultsData, type LeaderboardData } from '../data/dataClient'
import BonusChallengeScreen from './BonusChallengeScreen'

interface Props {
  participantCode: string
  group: string
  selfPaced?: boolean
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const round1 = (n: number) => n.toFixed(1)

export default function ResultsScreen({ participantCode, group, selfPaced = false }: Props) {
  const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'

  const [showBonus, setShowBonus] = useState(false)
  const [results, setResults] = useState<ResultsData | null>(null)
  const [resultsError, setResultsError] = useState('')
  const [resultsLoading, setResultsLoading] = useState(true)

  const [leaderboardRevealed, setLeaderboardRevealed] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')

  // Fetch personal results
  useEffect(() => {
    getResults(participantCode).then((res) => {
      if ('error' in res) {
        setResultsError(res.error)
      } else {
        setResults(res)
      }
      setResultsLoading(false)
    })
  }, [participantCode])

  // Leaderboard reveal: check current state then subscribe (skipped in self-paced mode)
  useEffect(() => {
    if (selfPaced) return

    let fired = false

    async function onReveal() {
      if (fired) return
      fired = true
      setLeaderboardRevealed(true)
      setLeaderboardLoading(true)
      const lb = await getLeaderboard(instanceId)
      if ('error' in lb) {
        setLeaderboardError(lb.error)
      } else {
        setLeaderboard(lb)
      }
      setLeaderboardLoading(false)
    }

    supabase
      .from('session_state')
      .select('leaderboard_revealed')
      .eq('instance_id', instanceId)
      .single()
      .then(({ data }) => {
        if (data?.leaderboard_revealed) onReveal()
      })

    const channel = supabase
      .channel(`results-lb-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_state',
          filter: `instance_id=eq.${instanceId}`,
        },
        (payload) => {
          if (payload.new.leaderboard_revealed) onReveal()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [instanceId, selfPaced])

  if (showBonus) {
    return <BonusChallengeScreen onBack={() => setShowBonus(false)} />
  }

  return (
    <div className="screen">
      {/* Participant code — prominent */}
      <div className="res-code-hero">
        <span className="res-code-label">Your participant code</span>
        <span className="res-code-value">{participantCode}</span>
      </div>

      <h1 className="screen-title" style={{ marginBottom: '1.5rem' }}>Your Results</h1>

      {resultsLoading && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="prose">Loading your results…</p>
        </div>
      )}

      {resultsError && (
        <div className="error-banner">
          <p>Could not load results: {resultsError}</p>
          <p>Your scores are safely recorded. Please refresh or ask the facilitator.</p>
        </div>
      )}

      {results && (
        <>
          {/* Final score hero */}
          <div className="card res-score-hero">
            <p className="section-label">Final Score</p>
            <div className="res-score-value">{results.final_score}</div>
            <p className="res-score-note">
              This reflects all item scores minus consultation and unlock costs.
            </p>
          </div>

          {/* Accuracy overview */}
          <div className="card">
            <p className="section-label">Accuracy</p>
            <div className="res-stat-row">
              <StatCell
                label="Part 1"
                value={pct(results.p1.accuracy)}
                sub={`${results.p1.correct} / ${results.p1.total} correct`}
              />
              <StatCell
                label="Part 2"
                value={pct(results.p2.accuracy)}
                sub={`${results.p2.correct} / ${results.p2.total} correct`}
              />
              <StatCell
                label="Overall"
                value={pct(results.overall.accuracy)}
                sub={`${results.overall.correct} / ${results.overall.total} correct`}
              />
            </div>
          </div>

          {/* Consultations — Groups B and C only */}
          {(group === 'B' || group === 'C') && results.p1.consult_count > 0 && (
            <div className="card">
              <p className="section-label">VeriScan Consultations (Part 1)</p>
              <div className="res-stat-row">
                <StatCell
                  label="Consultations"
                  value={String(results.p1.consult_count)}
                  sub={`${pct(results.p1.consult_rate)} of items`}
                />
                {results.overrides.count > 0 && (
                  <StatCell
                    label="Override attempts"
                    value={String(results.overrides.count)}
                    sub={`${pct(results.overrides.accuracy)} accuracy`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Part 2 unlock stats */}
          {results.p2.total > 0 && (
            <div className="card">
              <p className="section-label">Part 2 — Tiered Reports</p>
              <div className="res-stat-row" style={{ marginBottom: results.p2.accuracy_by_unlocks.length > 1 ? '1rem' : 0 }}>
                <StatCell
                  label="Avg unlocks / item"
                  value={round1(results.p2.avg_unlocks)}
                  sub="out of 5 tiers"
                />
                <StatCell
                  label="Part 2 accuracy"
                  value={pct(results.p2.accuracy)}
                  sub={`${results.p2.correct} / ${results.p2.total} correct`}
                />
              </div>
              {results.p2.accuracy_by_unlocks.length > 1 && (
                <div className="res-unlock-table">
                  <p className="section-label" style={{ marginBottom: '0.5rem' }}>Accuracy by unlock depth</p>
                  {results.p2.accuracy_by_unlocks.map(row => (
                    <div key={row.unlocks} className="res-unlock-row">
                      <span className="res-unlock-depth">{row.unlocks} unlock{row.unlocks !== 1 ? 's' : ''}</span>
                      <span className="res-unlock-frac">{row.correct}/{row.total}</span>
                      <span className="res-unlock-pct">{pct(row.accuracy)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <EmailResultsCard results={results} participantCode={participantCode} group={group} />
        </>
      )}

      {/* Leaderboard */}
      {selfPaced ? (
        <div className="card">
          <p className="section-label">Leaderboard</p>
          <p className="prose" style={{ color: '#94a3b8' }}>
            Leaderboard is not shown in self-paced mode.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="section-label">Leaderboard</p>
          {!leaderboardRevealed ? (
            <div className="res-lb-waiting">
              <span className="waiting-pulse" />
              <span>The facilitator will reveal the leaderboard shortly…</span>
            </div>
          ) : leaderboardLoading ? (
            <p className="prose">Loading leaderboard…</p>
          ) : leaderboardError ? (
            <p className="prose" style={{ color: '#fca5a5' }}>Could not load leaderboard: {leaderboardError}</p>
          ) : leaderboard ? (
            <LeaderboardDisplay leaderboard={leaderboard} selfCode={participantCode} />
          ) : null}
        </div>
      )}

      {/* Bonus challenge */}
      <button
        className="btn btn-secondary btn-full"
        onClick={() => setShowBonus(true)}
        style={{ marginBottom: '1.25rem' }}
      >
        While you wait: try the bonus challenge
      </button>

      {/* Withdrawal info */}
      <div className="card" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
        <p>
          <strong style={{ color: '#f1f5f9' }}>Withdrawal window: 7 days.</strong> If you wish to
          withdraw your data, provide your participant code{' '}
          <strong style={{ color: '#38bdf8', fontFamily: 'ui-monospace, monospace' }}>
            {participantCode}
          </strong>{' '}
          to the research team. Your data will be permanently deleted and excluded from all
          analyses. No self-delete is available through the app.
        </p>
      </div>
    </div>
  )
}

// ── Email / copy my results ────────────────────────────────────────────────────
// Client-side only: opens the participant's own mail app via mailto:. The address is
// never sent to the server, keeping emails unlinked from participant codes (spec §11).

function buildResultsSummary(results: ResultsData, participantCode: string, group: string): string {
  const eventName = import.meta.env.VITE_EVENT_NAME ?? 'VeriCheck Exercise'
  const lines = [
    `My ${eventName} results`,
    '',
    `Participant code: ${participantCode}`,
    `Final score: ${results.final_score}`,
    '',
    'Accuracy',
    `  Part 1: ${pct(results.p1.accuracy)} (${results.p1.correct}/${results.p1.total} correct)`,
    `  Part 2: ${pct(results.p2.accuracy)} (${results.p2.correct}/${results.p2.total} correct)`,
    `  Overall: ${pct(results.overall.accuracy)} (${results.overall.correct}/${results.overall.total} correct)`,
  ]
  if ((group === 'B' || group === 'C') && results.p1.consult_count > 0) {
    lines.push(
      '',
      `VeriScan consultations (Part 1): ${results.p1.consult_count} (${pct(results.p1.consult_rate)} of items)`,
    )
    if (results.overrides.count > 0) {
      lines.push(`Overrides of VeriScan: ${results.overrides.count} (${pct(results.overrides.accuracy)} accuracy)`)
    }
  }
  if (results.p2.total > 0) {
    lines.push('', `Part 2 average unlocks per item: ${round1(results.p2.avg_unlocks)} of 5`)
  }
  lines.push(
    '',
    `Withdrawal: within 7 days, give your participant code (${participantCode}) to the research team ` +
      'and your data will be permanently deleted.',
  )
  return lines.join('\n')
}

function EmailResultsCard({ results, participantCode, group }: {
  results: ResultsData
  participantCode: string
  group: string
}) {
  const [address, setAddress] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const summary = buildResultsSummary(results, participantCode, group)
  const eventName = import.meta.env.VITE_EVENT_NAME ?? 'VeriCheck Exercise'
  const subject = `My ${eventName} results (code ${participantCode})`
  const mailto =
    `mailto:${encodeURIComponent(address.trim())}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(summary.replace(/\n/g, '\r\n'))}`

  async function copy() {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="card">
      <p className="section-label">Keep a copy of your results</p>
      <p className="prose" style={{ fontSize: '0.9rem', marginBottom: '0.9rem' }}>
        Send your results and participant code to yourself. This opens your own email app with
        everything filled in. We don&apos;t see or store the address you enter.
      </p>
      <div className="field" style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="results-email">Your email address (optional)</label>
        <input
          id="results-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <a className="btn btn-primary" href={mailto} style={{ flex: '1 1 12rem', textAlign: 'center', textDecoration: 'none' }}>
          Email my results
        </a>
        <button className="btn btn-secondary" onClick={copy} style={{ flex: '1 1 12rem' }}>
          {copied ? 'Copied ✓' : 'Copy results'}
        </button>
      </div>
      {copyFailed && (
        <p style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '0.5rem' }}>
          Couldn&apos;t copy automatically — please note down your code: {participantCode}
        </p>
      )}
      <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.6rem' }}>
        Nothing happens when you tap “Email my results”? Use “Copy results” and paste into any message.
      </p>
    </div>
  )
}

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="res-stat">
      <span className="res-stat-label">{label}</span>
      <span className="res-stat-value">{value}</span>
      <span className="res-stat-sub">{sub}</span>
    </div>
  )
}

function LeaderboardDisplay({
  leaderboard,
  selfCode,
}: {
  leaderboard: LeaderboardData
  selfCode: string
}) {
  return (
    <div className="res-lb">
      <LbCategory
        icon="🏆"
        title="Top Scorers"
        rows={leaderboard.top_scorers.map(e => ({
          code: e.participant_code,
          metric: `${e.total_score} pts`,
        }))}
        selfCode={selfCode}
        emptyMsg="No scores yet"
      />

      <LbCategory
        icon="🎯"
        title="Most Accurate"
        rows={leaderboard.most_accurate.map(e => ({
          code: e.participant_code,
          metric: `${Math.round(e.accuracy * 100)}% (${e.correct}/${e.total})`,
        }))}
        selfCode={selfCode}
        emptyMsg="No accuracy data yet"
      />

      <LbCategory
        icon="🔍"
        title="Best at Catching Errors"
        rows={leaderboard.best_error_catchers.map(e => ({
          code: e.participant_code,
          metric: `${e.errors_caught} caught`,
        }))}
        selfCode={selfCode}
        emptyMsg="No error catches recorded"
      />
    </div>
  )
}

function LbCategory({
  icon,
  title,
  rows,
  selfCode,
  emptyMsg,
}: {
  icon: string
  title: string
  rows: Array<{ code: string; metric: string }>
  selfCode: string
  emptyMsg: string
}) {
  return (
    <div className="res-lb-category">
      <p className="res-lb-title">
        {icon} {title}
      </p>
      {rows.length === 0 ? (
        <p className="res-lb-empty">{emptyMsg}</p>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.code}
            className={`res-lb-row${row.code === selfCode ? ' res-lb-row--self' : ''}`}
          >
            <span className="res-lb-rank">#{i + 1}</span>
            <span className="res-lb-code">{row.code}</span>
            <span className="res-lb-metric">{row.metric}</span>
          </div>
        ))
      )}
    </div>
  )
}
