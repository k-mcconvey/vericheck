import { useEffect } from 'react'
import { supabase } from '../data/dataClient'

interface Props {
  participantCode: string
  selfPaced?: boolean
  onPart2Open: () => void
}

export default function BreakScreen({ participantCode, selfPaced = false, onPart2Open }: Props) {
  const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'

  useEffect(() => {
    if (selfPaced) return

    let fired = false
    function advance() {
      if (fired) return
      fired = true
      onPart2Open()
    }

    supabase
      .from('session_state')
      .select('current_phase')
      .eq('instance_id', instanceId)
      .single()
      .then(({ data }) => {
        if (data?.current_phase === 'part2') advance()
      })

    const channel = supabase
      .channel(`session-state-break-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_state',
          filter: `instance_id=eq.${instanceId}`,
        },
        (payload) => {
          if (payload.new.current_phase === 'part2') advance()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [instanceId, onPart2Open, selfPaced])

  return (
    <div className="screen" style={{ textAlign: 'center', paddingTop: '3rem' }}>
      <div className="code-bar" style={{ justifyContent: 'center' }}>
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="waiting-icon">☕</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Part 1 complete — take a break
        </h2>
        {selfPaced ? (
          <>
            <p className="prose" style={{ marginBottom: '1.5rem' }}>
              You have finished all Part 1 items. Continue when you are ready.
            </p>
            <button className="btn-primary" onClick={onPart2Open}>
              Continue to Part 2
            </button>
          </>
        ) : (
          <>
            <p className="prose" style={{ marginBottom: '1rem' }}>
              You have finished all Part 1 items. The facilitator will open Part 2 shortly.
              Please wait — this page will advance automatically.
            </p>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              <span className="waiting-pulse" />
              Waiting for Part 2 to open…
            </p>
          </>
        )}
      </div>

      <div className="card" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
        <p>
          Withdrawal window: 7 days. Keep your code:{' '}
          <strong style={{ color: '#38bdf8' }}>{participantCode}</strong>
        </p>
      </div>
    </div>
  )
}
