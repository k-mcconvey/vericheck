import { useState } from 'react'
import { setGroup } from '../data/dataClient'

interface Props {
  participantCode: string
  onGroupSet: (group: 'A' | 'B' | 'C') => void
}

type Group = 'A' | 'B' | 'C'

export default function GroupScreen({ participantCode, onGroupSet }: Props) {
  const [selected, setSelected] = useState<Group | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSelect(g: Group) {
    setSelected(g)
    setConfirming(true)
    setError(null)
  }

  function handleCancel() {
    setSelected(null)
    setConfirming(false)
    setError(null)
  }

  async function handleConfirm() {
    if (!selected) return
    setLoading(true)
    setError(null)
    const result = await setGroup(participantCode, selected)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Unknown error')
      return
    }
    onGroupSet(selected)
  }

  return (
    <div className="screen">
      <div className="code-bar">
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <h1 className="screen-title">Group Selection</h1>
      <p className="screen-sub">
        Select the group letter the facilitator assigned to you.
      </p>

      {!confirming && (
        <div className="card">
          <p className="section-label">Which group are you in?</p>
          <div className="group-grid">
            {(['A', 'B', 'C'] as Group[]).map((g) => (
              <button
                key={g}
                className={`btn-group${selected === g ? ' selected' : ''}`}
                onClick={() => handleSelect(g)}
                aria-label={`Group ${g}`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="prose" style={{ fontSize: '0.8rem', color: '#64748b' }}>
            If you are unsure which group you are in, ask the facilitator.
          </p>
        </div>
      )}

      {confirming && selected && (
        <div className="card">
          <div className="confirm-box">
            <div className="big-letter">{selected}</div>
            <p>You selected <strong>Group {selected}</strong>. Is that correct?</p>
            <div className="confirm-actions">
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Change
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <p>Could not save your group. Please try again or let the facilitator know.</p>
          <p>Detail: {error}</p>
        </div>
      )}
    </div>
  )
}
