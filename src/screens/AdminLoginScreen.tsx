import { useState } from 'react'
import { supabase } from '../data/dataClient'

interface Props {
  onSignedIn: () => void
}

export default function AdminLoginScreen({ onSignedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
    } else {
      onSignedIn()
    }
  }

  return (
    <div className="screen" style={{ maxWidth: '400px' }}>
      <h1 className="screen-title">Admin Login</h1>
      <p className="screen-sub">VeriCheck Facilitator Console</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="admin-pw">Password</label>
            <input
              id="admin-pw"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <p style={{ fontSize: '0.8rem', color: '#475569', textAlign: 'center', marginTop: '1rem' }}>
        Admin accounts are created in the Supabase dashboard. No public sign-up.
      </p>
    </div>
  )
}
