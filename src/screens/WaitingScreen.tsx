import { useEffect } from 'react'
import { supabase } from '../data/dataClient'

interface Props {
  participantCode: string
  group: string
  onPhaseOpen: () => void
}

export default function WaitingScreen({ participantCode, group, onPhaseOpen }: Props) {
  const instanceId = import.meta.env.VITE_INSTANCE_ID ?? 'test'

  useEffect(() => {
    let fired = false

    function advance() {
      if (fired) return
      fired = true
      onPhaseOpen()
    }

    // Check the current phase immediately in case it already opened
    supabase
      .from('session_state')
      .select('current_phase')
      .eq('instance_id', instanceId)
      .single()
      .then(({ data }) => {
        if (data?.current_phase === 'part1') advance()
      })

    // Subscribe to phase changes via Realtime
    const channel = supabase
      .channel(`session-state-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_state',
          filter: `instance_id=eq.${instanceId}`,
        },
        (payload) => {
          if (payload.new.current_phase === 'part1') advance()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [instanceId, onPhaseOpen])

  return (
    <div className="screen" style={{ textAlign: 'center', paddingTop: '3rem' }}>
      <div className="code-bar" style={{ justifyContent: 'center' }}>
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="waiting-icon">⏳</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Waiting for the facilitator
        </h2>
        <p className="prose" style={{ marginBottom: '1rem' }}>
          You are in <strong>Group {group}</strong>. The facilitator will open Part 1 shortly.
          Please wait — this page will advance automatically.
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
          <span className="waiting-pulse" />
          Waiting for phase to open…
        </p>
      </div>

      <div className="card" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
        <p>
          Your code <strong style={{ color: '#38bdf8' }}>{participantCode}</strong> is your
          identifier for this session. If you need to withdraw your data within 7 days, provide
          this code to the research team.
        </p>
      </div>
    </div>
  )
}
