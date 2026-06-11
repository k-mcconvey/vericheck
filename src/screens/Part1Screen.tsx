import { useState, useEffect, useRef } from 'react'
import {
  getSessionItems,
  logItemPresented,
  consultVeriScan,
  commitJudgment,
  type DisplayItem,
} from '../data/dataClient'

interface Props {
  participantCode: string
  group: string
  onDone: () => void
}

type Judgment = 'authentic' | 'manipulated' | 'cannot_tell'

const SS_IDX = 'vc_p1_idx'
const SS_SCORE = 'vc_p1_score'
const SS_CONSULTS = 'vc_p1_consults'

const STARTING_SCORE = Number(import.meta.env.VITE_STARTING_SCORE ?? 0)
const CONSULT_COST = 3

function pluralConsults(n: number) {
  if (n === 0) return 'No consults'
  if (n === 1) return 'Consulted once'
  if (n === 2) return 'Consulted twice'
  return `Consulted ${n} times`
}

export default function Part1Screen({ participantCode, group, onDone }: Props) {
  const [items, setItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [currentIndex, setCurrentIndex] = useState(() =>
    Number(sessionStorage.getItem(SS_IDX) ?? 0),
  )
  const [score, setScore] = useState(() =>
    Number(sessionStorage.getItem(SS_SCORE) ?? STARTING_SCORE),
  )
  const [totalConsults, setTotalConsults] = useState(() =>
    Number(sessionStorage.getItem(SS_CONSULTS) ?? 0),
  )

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [selectedJudgment, setSelectedJudgment] = useState<Judgment | null>(null)
  const [hasConsulted, setHasConsulted] = useState(false)
  const [veriscanResult, setVeriscanResult] = useState<{
    verdict: string
    abstained: boolean
    confidence: string | null
  } | null>(null)

  const [imgFailed, setImgFailed] = useState(false)
  const [pendingIndex, setPendingIndex] = useState(0)
  const [showInterstitial, setShowInterstitial] = useState(false)

  const presentedAtRef = useRef<number>(Date.now())

  // Fetch items once on mount
  useEffect(() => {
    getSessionItems(participantCode).then((result) => {
      if ('error' in result) {
        setFetchError(result.error)
        setLoading(false)
        return
      }
      setItems(result.items)
      setLoading(false)
    })
  }, [participantCode])

  // When items load, log the current item as presented
  useEffect(() => {
    if (!items.length || loading) return
    const idx = Number(sessionStorage.getItem(SS_IDX) ?? 0)
    if (idx >= items.length) {
      onDone()
      return
    }
    presentItem(idx, items)
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  function presentItem(idx: number, itemList: DisplayItem[]) {
    setCurrentIndex(idx)
    sessionStorage.setItem(SS_IDX, String(idx))
    setSelectedJudgment(null)
    setHasConsulted(false)
    setVeriscanResult(null)
    setImgFailed(false)
    setActionError('')
    const now = Date.now()
    presentedAtRef.current = now
    logItemPresented(participantCode, itemList[idx].id, itemList[idx].presentation_index, now)
  }

  async function handleConsult() {
    if (busy || hasConsulted || !items[currentIndex]) return
    const item = items[currentIndex]
    setBusy(true)
    setActionError('')

    const result = await consultVeriScan(
      participantCode,
      item.id,
      item.presentation_index,
      Date.now(),
    )

    if ('error' in result) {
      setActionError(result.error)
      setBusy(false)
      return
    }

    const newScore = score - CONSULT_COST
    const newConsults = totalConsults + 1
    setScore(newScore)
    setTotalConsults(newConsults)
    sessionStorage.setItem(SS_SCORE, String(newScore))
    sessionStorage.setItem(SS_CONSULTS, String(newConsults))
    setHasConsulted(true)
    setVeriscanResult(result)
    setBusy(false)
  }

  async function handleCommit() {
    if (!selectedJudgment || busy || !items[currentIndex]) return
    const item = items[currentIndex]
    setBusy(true)
    setActionError('')

    const result = await commitJudgment(
      participantCode,
      item.id,
      selectedJudgment,
      item.presentation_index,
      presentedAtRef.current,
      Date.now(),
    )

    if ('error' in result || !result.ok) {
      setActionError(result.error ?? 'Failed to submit judgment')
      setBusy(false)
      return
    }

    const nextIdx = currentIndex + 1
    setBusy(false)

    if (nextIdx >= items.length) {
      // Clear Part 1 sessionStorage state
      sessionStorage.removeItem(SS_IDX)
      sessionStorage.removeItem(SS_SCORE)
      sessionStorage.removeItem(SS_CONSULTS)
      onDone()
      return
    }

    // Show interstitial after every 5th item (0-indexed: after items 4, 9, 14…)
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
          <p className="prose">Loading items…</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="screen">
        <div className="error-banner">
          <p>Failed to load items: {fetchError}</p>
          <p>Please refresh the page and try again.</p>
        </div>
      </div>
    )
  }

  const item = items[currentIndex]
  if (!item) return null

  const canConsult = group !== 'A' && !hasConsulted && !busy
  const itemNumber = currentIndex + 1
  const totalItems = items.length

  return (
    <div className="screen">
      {/* Persistent code bar */}
      <div className="code-bar">
        <span>Code:</span>
        <strong>{participantCode}</strong>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
          Group {group}
        </span>
      </div>

      {/* Score + progress bar */}
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

        {/* Image */}
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
                console.error(`[Part1] Image failed to load: /stimuli/${item.image_filename}`)
              }}
            />
          )}
        </div>

        {/* Case context */}
        <p className="p1-case-context">{item.case_context}</p>
      </div>

      {/* Scoring reminder */}
      <p className="p1-scoring-note">
        Correct: +10 · Incorrect: −5 · Cannot tell: 0
        {group !== 'A' && ' · Consult VeriScan: −3'}
      </p>

      {/* Action error */}
      {actionError && (
        <div className="error-banner">
          <p>{actionError}</p>
        </div>
      )}

      {/* Consult section (Groups B and C only) */}
      {group !== 'A' && (
        <div className="card p1-consult-card">
          {!hasConsulted ? (
            <button
              className="btn btn-consult btn-full"
              onClick={handleConsult}
              disabled={!canConsult || busy}
            >
              {busy ? 'Consulting…' : 'Consult VeriScan (−3)'}
            </button>
          ) : (
            <div className="p1-veriscan-result">
              <p className="p1-veriscan-label">VeriScan analysis</p>
              <p className="p1-veriscan-verdict">
                {veriscanResult?.abstained
                  ? 'Uncertain / cannot determine'
                  : veriscanResult?.verdict === 'authentic'
                  ? 'Authentic'
                  : 'Manipulated'}
              </p>
              {veriscanResult?.confidence && (
                <p className="p1-veriscan-confidence">
                  Confidence: {veriscanResult.confidence}
                </p>
              )}
              <p className="p1-veriscan-note">−3 charged. Your judgment may differ.</p>
            </div>
          )}
        </div>
      )}

      {/* Judgment buttons */}
      <div className="card">
        <p className="section-label">Your judgment</p>
        <div className="p1-judgment-grid">
          {(['authentic', 'manipulated', 'cannot_tell'] as Judgment[]).map((j) => (
            <button
              key={j}
              className={`btn p1-judgment-btn${selectedJudgment === j ? ' selected' : ''}`}
              onClick={() => setSelectedJudgment(j)}
              disabled={busy}
            >
              {j === 'authentic' ? 'Authentic' : j === 'manipulated' ? 'Manipulated' : 'Cannot tell'}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary btn-full btn-lg"
          style={{ marginTop: '1rem' }}
          onClick={handleCommit}
          disabled={!selectedJudgment || busy}
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
              {group !== 'A' && (
                <div className="p1-interstitial-stat">
                  <span className="p1-interstitial-stat-label">Consults</span>
                  <span className="p1-interstitial-stat-value">{totalConsults}</span>
                </div>
              )}
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              {pluralConsults(totalConsults)} so far. Keep going!
            </p>
            <button className="btn btn-primary btn-full btn-lg" onClick={dismissInterstitial}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
