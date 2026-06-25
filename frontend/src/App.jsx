import { useState, useEffect } from 'react'
import Dashboard from './Dashboard.jsx'

const CREDENTIALS = {
  username: import.meta.env.VITE_LOGIN_USER || '101',
  password: import.meta.env.VITE_LOGIN_PASS || '101_3DDEVINE',
}

const SESSION_KEY = 'pd_authed'

function LoginScreen({ onAuth }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setTimeout(() => {
      if (user === CREDENTIALS.username && pass === CREDENTIALS.password) {
        sessionStorage.setItem(SESSION_KEY, '1')
        onAuth()
      } else {
        setError('Invalid username or password')
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080808', fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <div style={{ width: 320 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#00cc66', marginBottom: 4 }}>
            printdash
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>by fofus.in</div>
        </div>

        <form onSubmit={submit} style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: 24
        }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
              Username
            </div>
            <input
              value={user} onChange={e => setUser(e.target.value)}
              autoComplete="username" required
              style={{
                width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
                color: '#e0e0e0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
              Password
            </div>
            <input
              type="password" value={pass} onChange={e => setPass(e.target.value)}
              autoComplete="current-password" required
              style={{
                width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
                color: '#e0e0e0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 12, textAlign: 'center' }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '10px', background: loading ? '#0d0d0d' : '#00cc66',
            color: loading ? '#444' : '#000', border: 'none', borderRadius: 7,
            fontWeight: 800, fontSize: 12, cursor: loading ? 'default' : 'pointer',
            letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.15s'
          }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  if (!authed) {
    return <LoginScreen onAuth={() => setAuthed(true)} />
  }

  return <Dashboard />
}