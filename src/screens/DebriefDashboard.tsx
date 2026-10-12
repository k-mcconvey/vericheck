import { useState, useEffect, useRef } from 'react'
import * as dc from '../data/dataClient'

// End-of-session debrief, designed to be projected for participants.
// Reveals ground truth and VeriScan scores; codes only, never names.

const CROWD = '#3987e5'     // series: participants
const VERISCAN = '#d95926'  // series: VeriScan
const CORRECT = '#34d399'
const WRONG = '#f87171'
const ABSTAIN = '#64748b'

const GROUP_LABELS: Record<'A' | 'B' | 'C', string> = {
  A: 'No tool',
  B: 'With VeriScan',
  C: 'VeriScan + limitations briefing',
}

const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
const fmtVerdict = (v: string) => (v === 'cannot_tell' ? 'Cannot tell' : v === 'authentic' ? 'Authentic' : 'Manipulated')

export default function DebriefDashboard({ instanceId }: { instanceId: string }) {
  const [data, setData] = useState<dc.DebriefData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true); setError('')
    const result = await dc.adminGetDebrief(instanceId)
    setLoading(false)
    if ('error' in result) setError(result.error)
    else setData(result)
  }

  useEffect(() => { load() }, [instanceId])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else rootRef.current?.requestFullscreen().catch(() => {})
  }

  return (
    <div ref={rootRef} className={`debrief${fullscreen ? ' debrief--fullscreen' : ''}`}>
      <div className="debrief-toolbar">
        <span className="debrief-toolbar-note">
          Reveals answers and VeriScan scores — show only at the end of the session.
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary debrief-toolbar-btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-primary debrief-toolbar-btn" onClick={toggleFullscreen}>
            {fullscreen ? 'Exit Full Screen' : 'Present Full Screen'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!data && loading && <p className="prose">Loading debrief…</p>}
      {data && data.overall.judgments === 0 && (
        <div className="card"><p className="prose">No judgments recorded for this instance yet.</p></div>
      )}
      {data && data.overall.judgments > 0 && <DebriefContent data={data} />}
    </div>
  )
}

function DebriefContent({ data }: { data: dc.DebriefData }) {
  const { overall, trust, unlocks } = data
  const groupsWithData = data.groups.filter(g => g.participants > 0)
  const phasesWithData = data.phases.filter(p => p.n > 0)

  return (
    <>
      <h1 className="debrief-title">How did we do?</h1>

      {/* ── Headline numbers ── */}
      <div className="debrief-tiles">
        <Tile value={String(data.participants.total)} label="participants" />
        <Tile value={String(overall.judgments)} label="judgments made" />
        <Tile value={fmtPct(overall.pct_correct)} label="judged correctly" />
        <Tile
          value={overall.avg_seconds === null ? '—' : `${overall.avg_seconds}s`}
          label="average time per item"
        />
      </div>

      {/* ── Podium ── */}
      <Section title="Leaderboard">
        <div className="debrief-podium">
          <Podium
            title="Top scorers"
            rows={data.top_scorers.map(e => ({ code: e.participant_code, metric: `${e.total_score} pts` }))}
          />
          <Podium
            title="Most accurate"
            rows={data.most_accurate.map(e => ({
              code: e.participant_code,
              metric: `${Math.round(e.accuracy * 100)}%`,
              sub: `${e.correct}/${e.total}`,
            }))}
          />
          <Podium
            title="Best at catching VeriScan's errors"
            rows={data.best_error_catchers.map(e => ({
              code: e.participant_code,
              metric: `${e.errors_caught} caught`,
            }))}
            empty="Nobody overrode a wrong VeriScan verdict."
          />
        </div>
      </Section>

      {/* ── Humans vs VeriScan ── */}
      {phasesWithData.length > 0 && (
        <Section
          title="You vs. VeriScan"
          subtitle="Share of items judged correctly. Abstaining (“cannot tell”) is never counted as correct."
        >
          <div className="debrief-legend">
            <LegendSwatch color={CROWD} label="Participants" />
            <LegendSwatch color={VERISCAN} label="VeriScan" />
          </div>
          {phasesWithData.map(p => (
            <div key={p.phase} className="debrief-bargroup">
              <div className="debrief-bargroup-label">Part {p.phase}</div>
              <Bar
                label="Participants"
                value={p.crowd_pct_correct}
                color={CROWD}
                tooltip={`Participants, Part ${p.phase}: ${fmtPct(p.crowd_pct_correct)} correct of ${p.n} judgments (${fmtPct(p.crowd_pct_abstain)} cannot tell)`}
              />
              <Bar
                label="VeriScan"
                value={p.veriscan_pct_correct}
                color={VERISCAN}
                tooltip={`VeriScan, Part ${p.phase}: ${fmtPct(p.veriscan_pct_correct)} correct across ${p.items} items (${fmtPct(p.veriscan_pct_abstain)} cannot tell)`}
              />
            </div>
          ))}
        </Section>
      )}

      {/* ── Trust in the tool ── */}
      {trust.consultations > 0 && (
        <Section
          title="Did you trust the machine?"
          subtitle={`Part 1, across ${trust.consultations} VeriScan consultations that gave a verdict${
            trust.consult_rate !== null ? ` — participants with the tool consulted it on ${fmtPct(trust.consult_rate)} of items` : ''
          }.`}
        >
          <div className="debrief-tiles">
            <Tile
              value={fmtPct(trust.followed_when_wrong_pct)}
              label={`went along with VeriScan when it was wrong (${trust.tool_wrong_n} times)`}
              tone="bad"
            />
            <Tile
              value={fmtPct(trust.caught_when_wrong_pct)}
              label="overrode a wrong verdict and got it right"
              tone="good"
            />
            <Tile
              value={fmtPct(trust.followed_when_right_pct)}
              label={`went along with VeriScan when it was right (${trust.tool_right_n} times)`}
            />
          </div>
        </Section>
      )}

      {/* ── Groups ── */}
      {groupsWithData.length > 1 && (
        <Section
          title="Did the tool help?"
          subtitle="Share judged correctly, by the group you were assigned to."
        >
          {groupsWithData.map(g => (
            <div key={g.group} className="debrief-bargroup">
              <div className="debrief-bargroup-label">
                Group {g.group} · {GROUP_LABELS[g.group]}
                <span className="debrief-muted"> — {g.participants} people, avg {g.avg_score ?? '—'} pts</span>
              </div>
              <Bar
                label="Correct"
                value={g.pct_correct}
                color={CROWD}
                tooltip={`Group ${g.group}: ${fmtPct(g.pct_correct)} overall · Part 1 ${fmtPct(g.part1_pct_correct)} · Part 2 ${fmtPct(g.part2_pct_correct)}`}
              />
            </div>
          ))}
        </Section>
      )}

      {/* ── What tripped people up ── */}
      <Section title="What was hardest to spot?">
        <div className="debrief-tiles">
          {data.by_truth.filter(t => t.n > 0).map(t => (
            <Tile
              key={t.ground_truth}
              value={fmtPct(t.pct_correct)}
              label={`correct on ${t.ground_truth === 'manipulated' ? 'manipulated' : 'authentic'} items`}
            />
          ))}
          {data.by_type.filter(t => t.n > 0).map(t => (
            <Tile key={t.type} value={fmtPct(t.pct_correct)} label={`correct on ${t.type}s`} />
          ))}
          {overall.avg_seconds_correct !== null && overall.avg_seconds_wrong !== null && (
            <Tile
              value={`${overall.avg_seconds_correct}s vs ${overall.avg_seconds_wrong}s`}
              label="avg time on correct vs. wrong answers"
            />
          )}
        </div>
      </Section>

      {/* ── Hardest items ── */}
      {data.hardest.length > 0 && (
        <Section
          title="The hardest items"
          subtitle={`Lowest share of correct judgments${data.min_item_n > 1 ? ` (items seen by at least ${data.min_item_n} people)` : ''}.`}
        >
          <div className="debrief-items">
            {data.hardest.map((item, i) => <ItemCard key={item.item_id} item={item} rank={i + 1} />)}
          </div>
        </Section>
      )}

      {data.easiest.length > 0 && data.hardest.length > 1 && (
        <Section title="…and the easiest">
          <div className="debrief-items">
            <ItemCard item={data.easiest[0]} />
          </div>
        </Section>
      )}

      {/* ── Part 2 unlocks ── */}
      {unlocks.n > 0 && unlocks.some_unlock_n > 0 && unlocks.no_unlock_n > 0 && (
        <Section
          title="Did more information help?"
          subtitle={`Part 2: on average you unlocked ${unlocks.avg_unlocks} tier(s) of VeriScan detail per item.`}
        >
          <div className="debrief-tiles">
            <Tile
              value={fmtPct(unlocks.no_unlock_pct_correct)}
              label={`correct with no unlocks (${unlocks.no_unlock_n} judgments)`}
            />
            <Tile
              value={fmtPct(unlocks.some_unlock_pct_correct)}
              label={`correct after unlocking at least one tier (${unlocks.some_unlock_n} judgments)`}
            />
          </div>
        </Section>
      )}

      <p className="debrief-footnote">
        Participant codes only. Group comparisons are descriptive for this session, not research findings.
      </p>
    </>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="debrief-section">
      <h2 className="debrief-section-title">{title}</h2>
      {subtitle && <p className="debrief-section-subtitle">{subtitle}</p>}
      {children}
    </section>
  )
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="debrief-tile">
      <div className="debrief-tile-value">
        {tone === 'good' && <span className="debrief-tone" style={{ color: CORRECT }} aria-label="good">✓ </span>}
        {tone === 'bad' && <span className="debrief-tone" style={{ color: WRONG }} aria-label="warning">! </span>}
        {value}
      </div>
      <div className="debrief-tile-label">{label}</div>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function Podium({ title, rows, empty = 'No data yet.' }: {
  title: string
  rows: Array<{ code: string; metric: string; sub?: string }>
  empty?: string
}) {
  return (
    <div className="debrief-podium-col">
      <div className="debrief-podium-title">{title}</div>
      {rows.length === 0 ? (
        <p className="debrief-muted">{empty}</p>
      ) : (
        rows.map((r, i) => (
          <div key={r.code} className={`debrief-podium-row${i === 0 ? ' debrief-podium-row--first' : ''}`}>
            <span className="debrief-podium-medal" aria-label={`Rank ${i + 1}`}>{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="debrief-podium-code">{r.code}</span>
            <span className="debrief-podium-metric">
              {r.metric}
              {r.sub && <span className="debrief-muted"> {r.sub}</span>}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="debrief-legend-item">
      <span className="debrief-legend-swatch" style={{ background: color }} />
      {label}
    </span>
  )
}

function Bar({ label, value, color, tooltip }: { label: string; value: number | null; color: string; tooltip: string }) {
  return (
    <div className="debrief-bar-row" title={tooltip}>
      <span className="debrief-bar-label">{label}</span>
      <div className="debrief-bar-track">
        {value !== null && (
          <div className="debrief-bar-fill" style={{ width: `${Math.max(value, 0.5)}%`, background: color }} />
        )}
      </div>
      <span className="debrief-bar-value">{fmtPct(value)}</span>
    </div>
  )
}

function ItemCard({ item, rank }: { item: dc.DebriefItem; rank?: number }) {
  const segs = [
    { key: 'correct', icon: '✓', label: 'Correct', pct: item.pct_correct, color: CORRECT },
    { key: 'wrong', icon: '✗', label: 'Wrong', pct: item.pct_wrong, color: WRONG },
    { key: 'abstain', icon: '?', label: 'Cannot tell', pct: item.pct_abstain, color: ABSTAIN },
  ].filter(s => s.pct > 0)

  return (
    <div className="debrief-item">
      <div className="debrief-item-media">
        {rank !== undefined && <span className="debrief-item-rank">#{rank}</span>}
        <img src={`/stimuli/${item.image_filename}`} alt={`Item ${item.item_id}: ${item.family}`} loading="lazy" />
      </div>
      <div className="debrief-item-body">
        <div className="debrief-item-context">{item.case_context}</div>
        <div className="debrief-item-meta">
          {item.type} · {item.family} · {item.stakes_tag} · Part {item.phase} · item {item.item_id}
        </div>

        <div className="debrief-item-facts">
          <div>
            <div className="debrief-fact-label">Actually</div>
            <span className={`debrief-truth debrief-truth--${item.ground_truth}`}>{fmtVerdict(item.ground_truth)}</span>
          </div>
          <div>
            <div className="debrief-fact-label">VeriScan said</div>
            <span className="debrief-fact-value">
              {fmtVerdict(item.veriscan_verdict)}{' '}
              <span style={{ color: item.veriscan_verdict === 'cannot_tell' ? ABSTAIN : item.veriscan_correct ? CORRECT : WRONG }}>
                {item.veriscan_verdict === 'cannot_tell' ? '(abstained)' : item.veriscan_correct ? '✓' : '✗ wrong'}
              </span>
            </span>
            <div className="debrief-muted" style={{ fontSize: '0.8em' }}>
              score {item.veriscan_score.toFixed(3)} (0 = authentic, 1 = manipulated)
            </div>
          </div>
          <div>
            <div className="debrief-fact-label">You said</div>
            <span className="debrief-fact-value">
              {Math.round(item.pct_said_authentic)}% authentic · {Math.round(item.pct_said_manipulated)}% manipulated
            </span>
          </div>
        </div>

        <div
          className="debrief-stack"
          role="img"
          aria-label={segs.map(s => `${s.label} ${Math.round(s.pct)}%`).join(', ')}
        >
          {segs.map(s => (
            <div
              key={s.key}
              className={`debrief-stack-seg debrief-stack-seg--${s.key}`}
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.label}: ${Math.round(s.pct)}% of ${item.n}`}
            >
              {s.pct >= 12 && <span>{s.icon} {Math.round(s.pct)}%</span>}
            </div>
          ))}
        </div>
        <div className="debrief-stack-legend">
          {segs.map(s => (
            <span key={s.key}>{s.icon} {s.label} {Math.round(s.pct)}%</span>
          ))}
          <span className="debrief-muted">n = {item.n}</span>
        </div>
      </div>
    </div>
  )
}
