import { useState } from 'react'
import { startParticipant } from '../data/dataClient'

interface Props {
  onStarted: (code: string, seed: number) => void
}

export default function LandingScreen({ onStarted }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventName = import.meta.env.VITE_EVENT_NAME ?? 'VeriCheck Exercise'
  const missingEnv = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY

  async function handleStart() {
    setLoading(true)
    setError(null)
    const result = await startParticipant()
    setLoading(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onStarted(result.participant_code, result.order_seed)
  }

  return (
    <div className="screen">
      <h1 className="screen-title">VeriCheck</h1>
      <p className="screen-sub">{eventName}</p>

      {missingEnv && (
        <div className="error-banner">
          <p>Configuration missing — VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.</p>
          <p>Add both to .env.local and restart the dev server.</p>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <p>Could not connect to the server. Please let the facilitator know.</p>
          <p>Detail: {error}</p>
        </div>
      )}

      <div className="card">
        <p className="section-label">What you are about to do</p>
        <div className="prose">
          <p>
            In this exercise you will examine images and documents submitted as evidence in
            fictional legal cases and decide whether each one is authentic or has been
            manipulated. You may also interact with an AI verification tool called{' '}
            <strong>VeriScan</strong>.
          </p>
          <p>
            Your decisions earn or cost points. At the end you will see your personal results
            and, once the facilitator reveals it, the leaderboard.
          </p>
          <p>
            You will be assigned a random <strong>participant code</strong> when you start.
            Keep it — you will need it if you later wish to withdraw your data. It will also
            appear on your results screen.
          </p>
          <p>
            The exercise takes roughly 2–3 hours. Before it begins, you will complete a short
            consent form and a brief demographic survey.
          </p>
        </div>
      </div>

      <button
        className="btn btn-primary btn-full btn-lg"
        onClick={handleStart}
        disabled={loading || missingEnv}
      >
        {loading ? 'Setting up…' : 'Get started'}
      </button>
    </div>
  )
}
