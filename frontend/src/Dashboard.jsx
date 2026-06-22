import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STATUS_COLOR = {
  printing: '#00ff88', idle: '#555', paused: '#ff9800',
  error: '#ff4444', offline: '#2a2a2a', slicing: '#00aaff'
}

const ORDER_STAGES = ['NEW', 'AI_PREP', 'PRINTING', 'POST_PROCESS', 'QUALITY_CHECK', 'PACK', 'DISPATCH']
const ORDER_COLOR = {
  NEW: '#444', AI_PREP: '#00aaff', PRINTING: '#00ff88',
  POST_PROCESS: '#ff9800', QUALITY_CHECK: '#aa44ff', PACK: '#ff9800', DISPATCH: '#00ff88'
}

function StatCard({ label, value, sub, color = '#fff', icon }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '10px', padding: '16px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 20, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: '#444', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function PulsingDot({ color }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: color === '#00ff88' ? 'pulse 2s infinite' : 'none'
      }} />
    </span>
  )
}

function PrinterCard({ printer, onAction }) {
  const color = STATUS_COLOR[printer.status] || '#555'
  const pct = printer.progress_pct ?? 0
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}22`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulsingDot color={color} />
          <span style={{ fontSize: 12, color: '#ddd', fontWeight: 600 }}>{printer.name}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: color + '22', color, border: `1px solid ${color}44`, letterSpacing: '0.08em'
          }}>{printer.status.toUpperCase()}</span>
          {printer.status === 'printing' && (
            <button onClick={() => onAction(printer.id, 'pause')} style={{
              fontSize: 9, padding: '2px 8px', background: 'transparent',
              border: '1px solid #333', color: '#888', cursor: 'pointer', borderRadius: 3
            }}>PAUSE</button>
          )}
          {printer.status === 'paused' && (
            <button onClick={() => onAction(printer.id, 'resume')} style={{
              fontSize: 9, padding: '2px 8px', background: '#00ff8822',
              border: '1px solid #00ff8844', color: '#00ff88', cursor: 'pointer', borderRadius: 3
            }}>RESUME</button>
          )}
        </div>
      </div>
      {printer.current_job && (
        <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginBottom: 8 }}>
          {printer.current_job}
        </div>
      )}
      {printer.status === 'printing' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: '#444' }}>PROGRESS</span>
            <span style={{ fontSize: 9, color: color, fontFamily: 'monospace' }}>{pct}%</span>
          </div>
          <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function SliceCard({ entry }) {
  const flagged = entry.flagged_for_review
  const timeDiff = entry.actual_time_seconds && entry.claimed_time_seconds
    ? Math.round(((entry.actual_time_seconds - entry.claimed_time_seconds) / entry.claimed_time_seconds) * 100)
    : null
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${flagged ? '#ff980033' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{entry.spec_id || 'slice'}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em',
          background: (flagged ? '#ff9800' : '#00ff88') + '22',
          color: flagged ? '#ff9800' : '#00ff88',
          border: `1px solid ${(flagged ? '#ff9800' : '#00ff88')}44`
        }}>{flagged ? '⚠ FLAGGED' : '✓ PASS'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {[
          ['Material', entry.material || '—'],
          ['Machine', entry.machine_class || '—'],
          ['Time', entry.actual_time_seconds != null ? `${Math.round(entry.actual_time_seconds / 60)}min` : '—'],
          ['Weight', entry.actual_weight_grams != null ? `${entry.actual_weight_grams}g` : '—'],
          ['Δ Time', timeDiff != null ? `${timeDiff > 0 ? '+' : ''}${timeDiff}%` : '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
            <div style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace', marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: '#2a2a2a' }}>
        {new Date(entry.received_at).toLocaleString()}
      </div>
    </div>
  )
}

function OrderRow({ order }) {
  const stageIdx = ORDER_STAGES.indexOf(order.status)
  const color = ORDER_COLOR[order.status] || '#444'
  return (
    <div style={{
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 11, color: '#ddd', fontFamily: 'monospace' }}>{order.spec_id || order.id}</span>
          <span style={{ fontSize: 10, color: '#444', marginLeft: 8 }}>{order.material} · qty {order.qty}</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.06em',
          background: color + '22', color, border: `1px solid ${color}44`
        }}>{order.status || 'LOGGED'}</span>
      </div>
      {stageIdx >= 0 && (
        <div style={{ display: 'flex', gap: 3 }}>
          {ORDER_STAGES.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: 2, borderRadius: 1,
              background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : '#1a1a1a'
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [farm, setFarm] = useState({ printers: [], stats: {}, orders: [], feedback: [] })
  const [sliceStatus, setSliceStatus] = useState(null)
  const [slicing, setSlicing] = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')

  const poll = async () => {
    try {
      const res = await fetch(`${API}/api/v1/farm/status`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setFarm(data)
      setLastPoll(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    let alive = true
    const safePoll = async () => { if (alive) await poll() }
    safePoll()
    const t = setInterval(safePoll, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const triggerSlice = async () => {
    setSlicing(true)
    setSliceStatus(null)
    try {
      const res = await fetch(`${API}/api/v1/slicer/slice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stl_path: null, material: 'PLA', machine: 'BambuA1' })
      })
      setSliceStatus(await res.json())
    } catch (e) { setSliceStatus({ error: e.message }) }
    setSlicing(false)
  }

  const printerAction = async (id, action) => {
    await fetch(`${API}/api/v1/printers/${id}/${action}`, { method: 'POST' })
    poll()
  }

  const stats = farm.stats || {}
  const printers = farm.printers || []
  const orders = (farm.orders || []).slice().reverse()
  const feedback = (farm.feedback || []).slice().reverse()
  const printing = printers.filter(p => p.status === 'printing').length
  const idle = printers.filter(p => p.status === 'idle').length

  const TABS = ['overview', 'printers', 'orders', 'slicer']

  return (
    <div style={{ minHeight: '100vh', padding: '24px 28px', fontFamily: "'Inter', system-ui, sans-serif", color: 'white', background: '#080808' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: '#00ff88' }}>printdash</span>
            <span style={{ fontSize: 11, color: '#333', fontWeight: 400 }}>by fofus.in</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PulsingDot color={error ? '#ff4444' : '#00ff88'} />
            <span style={{ fontSize: 10, color: error ? '#ff4444' : '#444' }}>
              {error ? `offline — ${error}` : lastPoll ? `live · ${lastPoll.toLocaleTimeString()}` : 'connecting...'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 5,
              background: tab === t ? '#00ff8815' : 'transparent',
              color: tab === t ? '#00ff88' : '#333',
              border: tab === t ? '1px solid #00ff8833' : '1px solid transparent',
              transition: 'all 0.15s'
            }}>{t}</button>
          ))}
          <button onClick={poll} style={{
            padding: '6px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 5,
            background: 'transparent', border: '1px solid #1a1a1a', color: '#333'
          }}>↻</button>
        </div>
      </div>

      {/* Stats row — always visible */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard icon="📦" label="Active Orders" value={stats.active_orders} color="#00ff88" sub={`${orders.length} total logged`} />
        <StatCard icon="🖨" label="Printing" value={printing} color="#00aaff" sub={`${idle} idle · ${printers.length} total`} />
        <StatCard icon="⚠" label="Flagged" value={stats.flagged ?? feedback.filter(f => f.flagged_for_review).length} color="#ff9800" sub="needs review" />
        <StatCard icon="✓" label="Completed" value={stats.completed} color="#aaa" sub="this session" />
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <SectionHead>Printer Farm</SectionHead>
            {printers.length === 0
              ? <EmptyState>No printers registered yet</EmptyState>
              : printers.map(p => <PrinterCard key={p.id} printer={p} onAction={printerAction} />)
            }
          </div>
          <div>
            <SectionHead>Recent Slice Results</SectionHead>
            {feedback.length === 0
              ? <EmptyState>Send a design to farm to see results</EmptyState>
              : feedback.slice(0, 5).map((e, i) => <SliceCard key={i} entry={e} />)
            }
          </div>
        </div>
      )}

      {/* PRINTERS TAB */}
      {tab === 'printers' && (
        <div style={{ maxWidth: 600 }}>
          <SectionHead>All Printers</SectionHead>
          {printers.length === 0
            ? <EmptyState>No printers registered. POST to /api/v1/farm/printer to add one.</EmptyState>
            : printers.map(p => <PrinterCard key={p.id} printer={p} onAction={printerAction} />)
          }
        </div>
      )}

      {/* ORDERS TAB */}
      {tab === 'orders' && (
        <div>
          <SectionHead>{orders.length} Orders</SectionHead>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: '0 16px'
          }}>
            {orders.length === 0
              ? <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#2a2a2a' }}>No orders yet</div>
              : orders.map((o, i) => <OrderRow key={i} order={o} />)
            }
          </div>
        </div>
      )}

      {/* SLICER TAB */}
      {tab === 'slicer' && (
        <div style={{ maxWidth: 480 }}>
          <SectionHead>OrcaSlicer — Direct Slice</SectionHead>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: 20
          }}>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 16, lineHeight: 1.7 }}>
              Slices the last submitted design using <span style={{ color: '#ddd' }}>Bambu A1 · PLA · 0.20mm</span> profile.
              Compares actual vs claimed time/weight and flags if difference exceeds 10%.
            </div>
            <button onClick={triggerSlice} disabled={slicing} style={{
              width: '100%', padding: 12, borderRadius: 6,
              background: slicing ? '#111' : '#00ff88',
              color: slicing ? '#333' : '#000',
              border: slicing ? '1px solid #222' : 'none',
              fontWeight: 800, fontSize: 12, cursor: slicing ? 'default' : 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.2s'
            }}>
              {slicing ? '⏳ Slicing...' : '⚙ Slice Now'}
            </button>
            {sliceStatus && (
              <div style={{ marginTop: 16 }}>
                {sliceStatus.error
                  ? <div style={{ color: '#ff4444', fontSize: 12 }}>{sliceStatus.error}</div>
                  : <SliceCard entry={{ ...sliceStatus, spec_id: 'direct-slice', received_at: new Date().toISOString() }} />
                }
              </div>
            )}
            {feedback.length > 0 && (
              <>
                <div style={{ marginTop: 20, marginBottom: 12, fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Previous Slices
                </div>
                {feedback.slice(0, 10).map((e, i) => <SliceCard key={i} entry={e} />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, fontWeight: 700 }}>{children}</div>
}

function EmptyState({ children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)',
      borderRadius: 8, padding: '24px 16px', textAlign: 'center',
      fontSize: 11, color: '#2a2a2a'
    }}>{children}</div>
  )
}
