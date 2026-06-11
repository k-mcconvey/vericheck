import { useEffect, useState } from 'react'
import { pingSupabase } from './data/dataClient'

type Status = 'checking' | 'ok' | 'error'

export default function App() {
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState<string>()

  useEffect(() => {
    pingSupabase().then(({ ok, error }) => {
      setStatus(ok ? 'ok' : 'error')
      if (error) setErrorMsg(error)
    })
  }, [])

  const envUrl = import.meta.env.VITE_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  return (
    <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        VeriCheck
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Algorithmic Transparency and Trust — U of T Protocol #65720
      </p>

      <div style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: '1.5rem',
        textAlign: 'left',
        fontSize: '0.875rem',
        lineHeight: 1.6,
      }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#cbd5e1' }}>
          Milestone 1 — Environment Check
        </h2>

        <Row label="VITE_SUPABASE_URL" value={envUrl || '(not set)'} ok={!!envUrl} />
        <Row label="VITE_SUPABASE_ANON_KEY" value={envKey ? '(set)' : '(not set)'} ok={!!envKey} />

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
          <span style={{ color: '#94a3b8' }}>Supabase ping: </span>
          {status === 'checking' && <span style={{ color: '#f59e0b' }}>checking…</span>}
          {status === 'ok' && <span style={{ color: '#22c55e' }}>connected</span>}
          {status === 'error' && (
            <span style={{ color: '#f87171' }}>
              failed — {errorMsg ?? 'unknown error'}
            </span>
          )}
        </div>

        {(!envUrl || !envKey) && (
          <p style={{ marginTop: '1rem', color: '#f59e0b', fontSize: '0.8rem' }}>
            Fill in .env.local with your Supabase URL and anon key, then restart the dev server.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.4rem' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: ok ? '#22c55e' : '#f87171' }}>{value}</span>
    </div>
  )
}
