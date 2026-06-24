import { useEffect, useRef, useState } from 'react'
import { assignGroup } from '../data/dataClient'

interface Props {
  participantCode: string
  onGroupSet: (group: 'A' | 'B' | 'C') => void
}

export default function GroupScreen({ participantCode, onGroupSet }: Props) {
  const [error, setError] = useState<string | null>(null)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'
    assignGroup(participantCode, instanceId).then((result) => {
      if ('error' in result) {
        setError(result.error)
      } else if (result.group === 'A' || result.group === 'B' || result.group === 'C') {
        onGroupSet(result.group)
      } else {
        setError(`Unexpected group value from server: ${result.group}`)
      }
    })
  }, [participantCode, onGroupSet])

  return (
    <div className="screen">
      <div className="code-bar">
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <h1 className="screen-title">Assigning your group…</h1>

      {!error && (
        <p className="prose" style={{ textAlign: 'center', marginTop: '2rem' }}>
          Please wait.
        </p>
      )}

      {error && (
        <div className="error-banner">
          <p>Could not assign a group. Please let the facilitator know.</p>
          <p>Detail: {error}</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              called.current = false
              setError(null)
              const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'
              called.current = true
              assignGroup(participantCode, instanceId).then((result) => {
                if ('error' in result) {
                  setError(result.error)
                } else if (result.group === 'A' || result.group === 'B' || result.group === 'C') {
                  onGroupSet(result.group)
                } else {
                  setError(`Unexpected group value from server: ${result.group}`)
                }
              })
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
