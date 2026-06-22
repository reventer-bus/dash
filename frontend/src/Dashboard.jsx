import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const S = {
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '12px 14px' },
  label: { fontSize: '9px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' },
  val: { fontSize: '22px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#fff' },
  tag: (color) => ({ display: 'inline-block', fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: color + '22', color, border: `1px solid ${color}44`, letterSpacing: '0.08em' }),
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
}

const STATUS_COLOR = { printing: '#00ff88', idle: '#555', paused: '#ff9800', error: '#ff4444', offline: '#333', slicing: '#00aaff' }
const ORDER_COLOR = { NEW: '#555', AI_PREP: '#00aaff', PRINTING: '#00ff88', POST_PROCESS: '#ff9800', QUALITY_CHECK: '#aa44ff', PACK: '#ff9800', DISPATCH: '#00ff88' }

function StatCard({ label, value, color }) {
  return (
    <div style={S.card}>
      <div style={S.label}>{label}</div>
      <div style={{ ...S.val, color: color || '#fff' }}>{value}</div>
    </div>
  )
}

function SliceResult({ entry }) {
  const flagged = entry.flagged_for_review
  return (
    <div style={{ ...S.card, borderColor: flagged ? '#ff980044' : 'rgba(255,255,255,0.07)', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace' }}>{entry.spec_id}</span>
        <span style={S.tag(flagged ? '#ff9800' : '#00ff88')}>{flagged ? 'FLAGGED' : 'PASS'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {[
          ['Material', entry.material],
          ['Machine', entry.machine_class],
          ['Actual Time', entry.actual_time_seconds != null ? `${Math.round(entry.actual_time_seconds / 60)}min` : '—'],
          ['Actual Weight', entry.actual_weight_grams != null ? `${entry.actual_weight_grams}g` : '—'],
          ['Claimed Time', entry.claimed_time_seconds != null ? `${Math.round(entry.claimed_time_seconds / 60)}min` : '—'],
          ['Claimed Wt', entry.claimed_weight_grams != null ? `${entry.claimed_weight_grams}g` : '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ ...S.label, marginBottom: '1px' }}>{k}</div>
            <div style={{ fontSize: '12px', color: '#ccc', fontFamily: 'monospace' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '6px', fontSize: '9px', color: '#333' }}>{new Date(entry.received_at).toLocaleTimeString()}</div>
    </div>
  )
}

function PrinterRow({ printer, onAction }) {
  const color = STATUS_COLOR[printer.status] || '#555'
  return (
    <div style={S.row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '11px', color: '#ddd' }}>{printer.name}</div>
          {printer.current_job && <div style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>{printer.current_job}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {printer.progress_pct != null && (
          <div style={{ width: '60px', height: '4px', background: '#222', borderRadius: '2px' }}>
            <div style={{ width: `${printer.progress_pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
          </div>
        )}
        <span style={S.tag(color)}>{printer.status.toUpperCase()}</span>
        {printer.status === 'printing' && (
          <button onClick={() => onAction(printer.id, 'pause')}
            style={{ fontSize: '9px', padding: '2px 8px', background: 'transparent', border: '1px solid #333', color: '#666', cursor: 'pointer' }}>
            PAUSE
          </button>
        )}
      </div>
    </div>
  )
}

function OrderRow({ order }) {
  const color = ORDER_COLOR[order.status] || '#555'
  return (
    <div style={S.row}>
      <div>
        <div style={{ fontSize: '11px', color: '#ddd', fontFamily: 'monospace' }}>{order.spec_id || order.id}</div>
        <div style={{ fontSize: '10px', color: '#444' }}>{order.material} · qty {order.qty}</div>
      </div>
      <span style={S.tag(color)}>{order.status || 'LOGGED'}</span>
    </div>
  )
}

export default function Dashboard() {
  const [farm, setFarm] = useState({ printers: [], stats: {}, orders: [], feedback: [] })
  const [sliceStatus, setSliceStatus] = useState(null)
  const [slicing, setSlicing] = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error, setError] = useState(null)

  const poll = async () => {
    try {
      const res = await fetch(`${API}/api/v1/farm/status`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setFarm(data)
      setLastPoll(new Date())
      setError(null)
    } catch (e) {
      setError('Backend offline — ' + e.message)
    }
  }

  useEffect(() => {
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [])

  const triggerSlice = async () => {
    setSlicing(true)
    setSliceStatus(null)
    try {
      const res = await fetch(`${API}/api/v1/slicer/slice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stl_path: null, material: 'PLA', machine: 'BambuA1' }) })
      const data = await res.json()
      setSliceStatus(data)
    } catch (e) {
      setSliceStatus({ error: e.message })
    }
    setSlicing(false)
  }

  const printerAction = async (id, action) => {
    await fetch(`${API}/api/v1/printers/${id}/${action}`, { method: 'POST' })
    poll()
  }

  const stats = farm.stats || {}
  const printers = farm.printers || []
  const orders = farm.orders || []
  const feedback = farm.feedback || []

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '20px', fontFamily: "'Inter', sans-serif", color: 'white', background: '#0a0a0a' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#00ff88', letterSpacing: '0.15em' }}>FARM DASHBOARD</div>
          <div style={{ fontSize: '10px', color: '#333', marginTop: '2px' }}>fofus.in · live</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {error && <span style={{ fontSize: '10px', color: '#ff4444' }}>{error}</span>}
          {lastPoll && !error && <span style={{ fontSize: '10px', color: '#333' }}>updated {lastPoll.toLocaleTimeString()}</span>}
          <button onClick={poll} style={{ fontSize: '10px', padding: '4px 10px', background: 'transparent', border: '1px solid #222', color: '#555', cursor: 'pointer' }}>REFRESH</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        <StatCard label="Active Orders" value={stats.active_orders ?? '—'} color="#00ff88" />
        <StatCard label="Printing" value={stats.printing ?? '—'} color="#00aaff" />
        <StatCard label="Flagged" value={stats.flagged ?? '—'} color="#ff9800" />
        <StatCard label="Completed" value={stats.completed ?? '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* OrcaSlicer */}
        <div>
          <div style={{ ...S.label, marginBottom: '10px' }}>OrcaSlicer — Direct Slice</div>
          <div style={S.card}>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>
              Slice last design with Bambu A1 · PLA · 0.20mm profile
            </div>
            <button onClick={triggerSlice} disabled={slicing} style={{
              width: '100%', padding: '9px', background: slicing ? '#333' : '#00ff88',
              color: slicing ? '#666' : '#000', border: 'none', cursor: slicing ? 'default' : 'pointer',
              fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', transition: 'all 0.15s'
            }}>
              {slicing ? 'SLICING...' : '⚙ SLICE NOW'}
            </button>
            {sliceStatus && (
              <div style={{ marginTop: '10px', fontSize: '10px', fontFamily: 'monospace', lineHeight: '1.8' }}>
                {sliceStatus.error
                  ? <span style={{ color: '#ff4444' }}>{sliceStatus.error}</span>
                  : <>
                    <div style={{ color: sliceStatus.flagged_for_review ? '#ff9800' : '#00ff88' }}>
                      {sliceStatus.flagged_for_review ? '⚠ FLAGGED' : '✓ PASS'}
                    </div>
                    <div style={{ color: '#888' }}>time: {sliceStatus.actual_time_seconds != null ? `${Math.round(sliceStatus.actual_time_seconds / 60)}min` : '—'}</div>
                    <div style={{ color: '#888' }}>weight: {sliceStatus.actual_weight_grams ?? '—'}g</div>
                    {sliceStatus.orca_version && <div style={{ color: '#444' }}>orca: {sliceStatus.orca_version}</div>}
                  </>
                }
              </div>
            )}
          </div>

          {/* Printer Farm */}
          <div style={{ ...S.label, marginTop: '18px', marginBottom: '10px' }}>Printer Farm</div>
          <div style={S.card}>
            {printers.length === 0
              ? <div style={{ fontSize: '11px', color: '#333', textAlign: 'center', padding: '12px 0' }}>No printers registered</div>
              : printers.map(p => <PrinterRow key={p.id} printer={p} onAction={printerAction} />)
            }
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Slice Feedback */}
          <div style={{ ...S.label, marginBottom: '10px' }}>Slice Feedback (from n8n)</div>
          {feedback.length === 0
            ? <div style={{ ...S.card, fontSize: '11px', color: '#333', textAlign: 'center', padding: '16px 0', marginBottom: '16px' }}>
                Send a design to farm to see results here
              </div>
            : feedback.slice().reverse().slice(0, 8).map((e, i) => <SliceResult key={i} entry={e} />)
          }

          {/* Order Log */}
          <div style={{ ...S.label, marginTop: '4px', marginBottom: '10px' }}>Order Log</div>
          <div style={S.card}>
            {orders.length === 0
              ? <div style={{ fontSize: '11px', color: '#333', textAlign: 'center', padding: '12px 0' }}>No orders yet</div>
              : orders.slice().reverse().slice(0, 15).map((o, i) => <OrderRow key={i} order={o} />)
            }
          </div>
        </div>
      </div>
    </div>
  )
}
