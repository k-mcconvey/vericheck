import { useState, useEffect, useRef } from 'react'
import {
  getSessionItemsP2,
  logItemPresentedP2,
  unlockTier,
  commitJudgmentP2,
  type DisplayItemP2,
  type TierContent,
} from '../data/dataClient'
import { useItemDwellTimer } from '../hooks/useItemDwellTimer'

interface Props {
  participantCode: string
  onDone: () => void
}

type Judgment = 'authentic' | 'manipulated' | 'cannot_tell'

const SS_IDX = 'vc_p2_idx'
const SS_SCORE = 'vc_p2_score'
const SS_UNLOCKS = 'vc_p2_unlocks'

const TIER_NAMES = ['', 'Metadata', 'VeriScan Judgment', 'Confidence', 'Explanation', 'Limitations']

function formatDwellCountdown(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function Part2Screen({ participantCode, onDone }: Props) {
  const [items, setItems] = useState<DisplayItemP2[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [currentIndex, setCurrentIndex] = useState(() =>
    Number(sessionStorage.getItem(SS_IDX) ?? 0),
  )
  const [score, setScore] = useState(() =>
    Number(sessionStorage.getItem(SS_SCORE) ?? 0),
  )
  const [totalUnlocks, setTotalUnlocks] = useState(() =>
    Number(sessionStorage.getItem(SS_UNLOCKS) ?? 0),
  )

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [selectedJudgment, setSelectedJudgment] = useState<Judgment | null>(null)
  const [rationale, setRationale] = useState('')
  // Map from tier number (1–5) to content returned by the server
  const [unlockedTiers, setUnlockedTiers] = useState<Map<number, TierContent>>(new Map())

  const [imgFailed, setImgFailed] = useState(false)
  const [pendingIndex, setPendingIndex] = useState(0)
  const [showInterstitial, setShowInterstitial] = useState(false)
  const [itemStartMs, setItemStartMs] = useState(() => Date.now())

  const presentedAtRef = useRef<number>(Date.now())
  const restoredForIndexRef = useRef<number>(-1)
  const { secsLeft, ready: timerReady } = useItemDwellTimer(itemStartMs)

  // Fetch items on mount; sync score from server
  useEffect(() => {
    getSessionItemsP2(participantCode).then((result) => {
      if ('error' in result) {
        setFetchError(result.error)
        setLoading(false)
        return
      }
      setItems(result.items)
      setScore(result.total_score)
      sessionStorage.setItem(SS_SCORE, String(result.total_score))
      setLoading(false)
    })
  }, [participantCode])

  // When items load, present the current item
  useEffect(() => {
    if (!items.length || loading) return
    const idx = Number(sessionStorage.getItem(SS_IDX) ?? 0)
    if (idx >= items.length) {
      onDone()
      return
    }
    presentItem(idx, items)
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore unlocked tier content after a page refresh (idempotent — no charge)
  useEffect(() => {
    if (!items.length || loading) return
    if (restoredForIndexRef.current === currentIndex) return
    const item = items[currentIndex]
    const existing = (item.existing_unlocks ?? []).slice().sort((a, b) => a - b)
    if (existing.length === 0) return

    restoredForIndexRef.current = currentIndex
    let cancelled = false

    ;(async () => {
      const map = new Map<number, TierContent>()
      for (const tier of existing) {
        if (cancelled) break
        const result = await unlockTier(
          participantCode,
          item.id,
          tier,
          item.presentation_index,
          Date.now(),
        )
        if (!('error' in result)) map.set(tier, result.content)
      }
      if (!cancelled) setUnlockedTiers(map)
    })()

    return () => {
      cancelled = true
    }
  }, [currentIndex, items, loading, participantCode])

  function presentItem(idx: number, itemList: DisplayItemP2[]) {
    setCurrentIndex(idx)
    sessionStorage.setItem(SS_IDX, String(idx))
    setSelectedJudgment(null)
    setRationale('')
    setUnlockedTiers(new Map())
    setImgFailed(false)
    setActionError('')
    const now = Date.now()
    presentedAtRef.current = now
    setItemStartMs(now)
    logItemPresentedP2(participantCode, itemList[idx].id, itemList[idx].presentation_index, now)
  }

  async function handleUnlock(tier: number) {
    if (busy) return
    const item = items[currentIndex]
    setBusy(true)
    setActionError('')

    const result = await unlockTier(
      participantCode,
      item.id,
      tier,
      item.presentation_index,
      Date.now(),
    )

    if ('error' in result) {
      setActionError(result.error)
      setBusy(false)
      return
    }

    setUnlockedTiers((prev) => new Map(prev).set(tier, result.content))

    if (result.charged) {
      setScore(result.total_score)
      sessionStorage.setItem(SS_SCORE, String(result.total_score))
      const newUnlocks = totalUnlocks + 1
      setTotalUnlocks(newUnlocks)
      sessionStorage.setItem(SS_UNLOCKS, String(newUnlocks))
    }

    setBusy(false)
  }

  async function handleCommit() {
    if (!selectedJudgment || busy) return
    const item = items[currentIndex]
    setBusy(true)
    setActionError('')

    const result = await commitJudgmentP2(
      participantCode,
      item.id,
      selectedJudgment,
      item.presentation_index,
      presentedAtRef.current,
      Date.now(),
      rationale,
    )

    if ('error' in result || !result.ok) {
      setActionError(result.error ?? 'Failed to submit judgment')
      setBusy(false)
      return
    }

    if (result.total_score !== undefined) {
      setScore(result.total_score)
      sessionStorage.setItem(SS_SCORE, String(result.total_score))
    }

    const nextIdx = currentIndex + 1
    setBusy(false)

    if (nextIdx >= items.length) {
      sessionStorage.removeItem(SS_IDX)
      sessionStorage.removeItem(SS_SCORE)
      sessionStorage.removeItem(SS_UNLOCKS)
      onDone()
      return
    }

    if (nextIdx % 5 === 0) {
      setPendingIndex(nextIdx)
      setShowInterstitial(true)
    } else {
      presentItem(nextIdx, items)
    }
  }

  function dismissInterstitial() {
    setShowInterstitial(false)
    presentItem(pendingIndex, items)
  }

  if (loading) {
    return (
      <div className="screen" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="code-bar" style={{ justifyContent: 'center' }}>
          <span>Participant code:</span>
          <strong>{participantCode}</strong>
        </div>
        <div className="card">
          <p className="prose">Loading Part 2 items…</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="screen">
        <div className="error-banner">
          <p>Failed to load Part 2 items: {fetchError}</p>
          <p>Please refresh the page and try again.</p>
        </div>
      </div>
    )
  }

  const item = items[currentIndex]
  if (!item) return null

  const itemNumber = currentIndex + 1
  const totalItems = items.length

  // Tier N unlock button is enabled only if all tiers 1..N-1 are unlocked and tier N is not yet unlocked
  function tierIsNext(tier: number): boolean {
    if (unlockedTiers.has(tier)) return false
    for (let t = 1; t < tier; t++) {
      if (!unlockedTiers.has(t)) return false
    }
    return true
  }

  return (
    <div className="screen">
      {/* Persistent code bar */}
      <div className="code-bar">
        <span>Code:</span>
        <strong>{participantCode}</strong>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>Part 2</span>
      </div>

      {/* Score + progress */}
      <div className="p1-score-bar">
        <div className="p1-score-bar-left">
          <span className="p1-score-label">Score</span>
          <span className="p1-score-value">{score}</span>
        </div>
        <div className="p1-score-bar-right">
          <span className="p1-progress">
            {itemNumber} / {totalItems}
          </span>
        </div>
      </div>

      {/* Item card */}
      <div className="card p1-item-card">
        <div className="p1-item-meta">
          <span className="p1-type-badge">{item.type}</span>
          <span className={`p1-stakes-badge p1-stakes-badge--${item.stakes_tag}`}>{item.stakes_tag}</span>
        </div>

        <div className="p1-image-wrap">
          {imgFailed ? (
            <div className="p1-image-fallback">
              <p>Item {item.id}</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Image failed to load</p>
            </div>
          ) : (
            <img
              src={`/stimuli/${item.image_filename}`}
              alt={`Evidence item ${item.id}`}
              className="p1-image"
              loading="lazy"
              onError={() => {
                setImgFailed(true)
                console.error(`[Part2] Image failed to load: /stimuli/${item.image_filename}`)
              }}
            />
          )}
        </div>

        <p className="p1-case-context">{item.case_context}</p>
      </div>

      {/* Scoring reminder */}
      <p className="p1-scoring-note">
        Correct: +10 · Incorrect: −5 · Cannot tell: 0 · Each unlock: −2
      </p>

      {/* Action error */}
      {actionError && (
        <div className="error-banner">
          <p>{actionError}</p>
        </div>
      )}

      {/* Unlock ladder */}
      <div className="card p2-unlock-card">
        <p className="section-label">Tiered report — each unlock costs −2</p>
        <div className="p2-unlock-ladder">
          {[1, 2, 3, 4, 5].map((tier) => {
            const content = unlockedTiers.get(tier)
            const isUnlocked = content !== undefined
            const isNext = tierIsNext(tier)
            const isLocked = !isUnlocked && !isNext

            return (
              <div
                key={tier}
                className={`p2-tier-row${isUnlocked ? ' p2-tier-row--unlocked' : isLocked ? ' p2-tier-row--locked' : ''}`}
              >
                {isUnlocked ? (
                  <div className="p2-tier-content">
                    <div className="p2-tier-content-header">
                      <span className="p2-tier-check">✓</span>
                      <span className="p2-tier-label">Tier {tier}: {TIER_NAMES[tier]}</span>
                    </div>
                    <TierDisplay tier={tier} content={content} />
                  </div>
                ) : (
                  <button
                    className={`btn p2-tier-btn btn-full${isNext ? ' p2-tier-btn--next' : ' p2-tier-btn--locked'}`}
                    onClick={() => isNext && handleUnlock(tier)}
                    disabled={!isNext || busy}
                  >
                    <span className="p2-tier-btn-label">
                      {isLocked ? '🔒' : '▶'} Tier {tier}: {TIER_NAMES[tier]}
                    </span>
                    {isNext && (
                      <span className="p2-tier-btn-cost">
                        {busy ? '…' : '−2'}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Judgment */}
      <div className="card">
        <p className="section-label">Your judgment</p>
        <div className="p1-judgment-grid">
          {(['authentic', 'manipulated', 'cannot_tell'] as Judgment[]).map((j) => (
            <button
              key={j}
              className={`btn p1-judgment-btn${selectedJudgment === j ? ' selected' : ''}`}
              onClick={() => setSelectedJudgment(j)}
              disabled={busy || !timerReady}
            >
              {j === 'authentic' ? 'Authentic' : j === 'manipulated' ? 'Manipulated' : 'Cannot tell'}
            </button>
          ))}
        </div>

        {!timerReady && (
          <p className="dwell-countdown" aria-live="polite">
            You can submit in {formatDwellCountdown(secsLeft)}
          </p>
        )}

        <div className="rationale-field">
          <label className="rationale-label" htmlFor="p2-rationale">
            Why did you make this decision? <span>(optional)</span>
          </label>
          <textarea
            id="p2-rationale"
            className="rationale-textarea"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={busy}
          />
          <p className="rationale-hint">Please don't include any identifying information.</p>
        </div>

        <button
          className="btn btn-primary btn-full btn-lg"
          style={{ marginTop: '1rem' }}
          onClick={handleCommit}
          disabled={!selectedJudgment || busy || !timerReady}
        >
          {busy ? 'Submitting…' : 'Commit judgment'}
        </button>
      </div>

      {/* Interstitial overlay */}
      {showInterstitial && (
        <div className="p1-interstitial-overlay">
          <div className="p1-interstitial-card">
            <h2 className="p1-interstitial-title">
              {pendingIndex} of {totalItems} items
            </h2>
            <div className="p1-interstitial-stats">
              <div className="p1-interstitial-stat">
                <span className="p1-interstitial-stat-label">Score</span>
                <span className="p1-interstitial-stat-value">{score}</span>
              </div>
              <div className="p1-interstitial-stat">
                <span className="p1-interstitial-stat-label">Unlocks</span>
                <span className="p1-interstitial-stat-value">{totalUnlocks}</span>
              </div>
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={dismissInterstitial}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TierDisplay({ tier, content }: { tier: number; content: TierContent }) {
  if (tier === 1 || tier === 4 || tier === 5) {
    return <p className="p2-tier-text">{content.text}</p>
  }
  if (tier === 2) {
    return (
      <p className={`p2-tier-verdict${content.abstained ? ' p2-tier-verdict--uncertain' : ''}`}>
        {content.display}
      </p>
    )
  }
  // tier === 3
  return (
    <p className="p2-tier-text">
      Confidence: <strong>{content.display}</strong>
    </p>
  )
}
