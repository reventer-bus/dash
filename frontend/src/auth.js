// JWT auth for printdash — token storage + a global fetch interceptor.
//
// The dashboard has ~30 fetch() call sites; instead of threading a header
// through every one, importing this module patches window.fetch once so
// every same-app request to an /api/ path carries the Bearer token when a
// user is logged in. Requests to other hosts are untouched.
//
// Storage keys match what Dashboard.jsx already reads (pd_token).

const TOKEN_KEY = 'pd_token'
const USER_KEY = 'pd_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem('pd_authed')
}

// POST /auth/login then GET /auth/me; stores token + profile. Throws with a
// human-readable message on bad credentials or unreachable backend.
export async function login(apiBase, email, password) {
  const r = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.detail || `Login failed (HTTP ${r.status})`)
  localStorage.setItem(TOKEN_KEY, body.access_token)

  const me = await fetch(`${apiBase}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${body.access_token}` },
  })
  const user = me.ok ? await me.json() : { email }
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

// First-run: create the initial super_admin (register honors any role only
// while the users table is empty), then log in.
export async function bootstrapAdmin(apiBase, name, email, password) {
  const r = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role: 'super_admin' }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.detail || `Registration failed (HTTP ${r.status})`)
  return login(apiBase, email, password)
}

export async function bootstrapNeeded(apiBase) {
  try {
    const r = await fetch(`${apiBase}/api/v1/auth/bootstrap-needed`)
    if (!r.ok) return false
    return (await r.json()).needed === true
  } catch {
    return false // backend unreachable or too old — hide the first-run form
  }
}

// ── Global fetch interceptor ─────────────────────────────────────────────────

const _origFetch = window.fetch.bind(window)

window.fetch = (input, init) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/api/')) {
      init = { ...(init || {}) }
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
      init.headers = headers
    }
  }
  return _origFetch(input, init)
}
