import { useState, useEffect } from 'react'
import Dashboard from './Dashboard.jsx'
import { login, logout, getUser, getToken, bootstrapNeeded, bootstrapAdmin } from './auth.js'

// Legacy gate — kept as a fallback so the deployed partner login
// (client_id / client_id_PARTNER, no JWT) keeps working until every
// account is migrated to a real user row. Anything with an '@' goes
// through JWT auth instead.
const CREDENTIALS = {
  username: import.meta.env.VITE_LOGIN_USER || '101',
  password: import.meta.env.VITE_LOGIN_PASS || '101_3DDEVINE',
}

const SESSION_KEY = 'pd_authed'
const API = import.meta.env.VITE_API_URL ?? ''

const inputStyle = {
  width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
  color: '#e0e0e0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
  fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function LoginScreen({ onAuth }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [firstRun, setFirstRun] = useState(false)

  useEffect(() => {
    bootstrapNeeded(API).then(setFirstRun)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (firstRun) {
        const profile = await bootstrapAdmin(API, name || 'HQ Admin', user, pass)
        onAuth(profile)
        return
      }
      if (user.includes('@')) {
        // Real account → JWT via the backend users table
        const profile = await login(API, user, pass)
        onAuth(profile)
        return
      }
      // Legacy client_id gate (no JWT, unscoped API access)
      if (user === CREDENTIALS.username && pass === CREDENTIALS.password) {
        sessionStorage.setItem(SESSION_KEY, '1')
        onAuth(null)
        return
      }
      setError('Invalid username or password')
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setLoading(false)
    }
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
          {firstRun && (
            <div style={{
              fontSize: 10, color: '#ff9800', marginBottom: 16, lineHeight: 1.5,
              background: '#ff980010', border: '1px solid #ff980040', borderRadius: 6, padding: '8px 10px',
            }}>
              First run — no accounts exist yet. This form creates the
              <b> super admin</b>.
            </div>
          )}

          {firstRun && (
            <Field label="Display name">
              <input value={name} onChange={e => setName(e.target.value)}
                     autoComplete="name" style={inputStyle} />
            </Field>
          )}

          <Field label={firstRun ? 'Admin email' : 'Email or client ID'}>
            <input
              value={user} onChange={e => setUser(e.target.value)}
              autoComplete="username" required
              type={firstRun ? 'email' : 'text'}
              style={inputStyle}
            />
          </Field>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
              Password
            </div>
            <input
              type="password" value={pass} onChange={e => setPass(e.target.value)}
              autoComplete={firstRun ? 'new-password' : 'current-password'} required
              minLength={firstRun ? 8 : undefined}
              style={inputStyle}
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
            {loading ? 'Signing in...' : firstRun ? 'Create Admin' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  // Two auth modes: JWT (pd_token + pd_user in localStorage) or the legacy
  // sessionStorage gate. JWT wins when both are present.
  const [authUser, setAuthUser] = useState(() => (getToken() ? getUser() : null))
  const [legacyAuthed, setLegacyAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  const handleAuth = (profile) => {
    if (profile) setAuthUser(profile)
    else setLegacyAuthed(true)
  }

  const handleLogout = () => {
    logout()
    setAuthUser(null)
    setLegacyAuthed(false)
  }

  if (!authUser && !legacyAuthed) {
    return <LoginScreen onAuth={handleAuth} />
  }

  if (authUser) {
    const isAdmin = authUser.role === 'super_admin'
    return (
      <Dashboard
        authUser={authUser}
        onLogout={handleLogout}
        adminMode={isAdmin}
        partnerScopeOnly={!isAdmin}
      />
    )
  }

  // Legacy gate — same behavior as before JWT existed
  return <Dashboard onLogout={handleLogout} />
}
