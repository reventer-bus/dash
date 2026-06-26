import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'

const ThemeCtx = createContext(null)
const useT = () => useContext(ThemeCtx)

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STATUS_COLOR = {
  printing: '#00cc66', idle: '#4a9eff', paused: '#ff9800',
  error: '#ff4444', offline: '#333', slicing: '#aa44ff', warming: '#ff9800'
}

const ORDER_STAGES = ['NEW', 'AI_PREP', 'PRINTING', 'POST_PROCESS', 'QC', 'PACK', 'DISPATCH']
const ORDER_COLOR = {
  NEW: '#555', AI_PREP: '#4a9eff', PRINTING: '#00cc66',
  POST_PROCESS: '#ff9800', QC: '#aa44ff', PACK: '#ff9800', DISPATCH: '#00cc66'
}
const ORDER_ICON = {
  NEW: '○', AI_PREP: '◎', PRINTING: '⬡', POST_PROCESS: '⚙',
  QC: '◈', PACK: '□', DISPATCH: '✓'
}

const MAT_COLOR = { PLA: '#00cc66', PETG: '#4a9eff', ABS: '#ff9800', TPU: '#aa44ff', ASA: '#ff6644', NYLON: '#ffcc00', 'PLA-CF': '#88ff44', 'PA-CF': '#ff88aa' }

// ─── Slicer constants ─────────────────────────────────────────────────────────

const SLICER_PRESETS = {
  Standard: { layerHeight: '0.20', infillDensity: 15, infillPattern: 'Grid',        walls: 2, topLayers: 4, bottomLayers: 3, supportType: 'none', supportThreshold: 45, printSpeed: 200, travelSpeed: 250, nozzleTemp: 220, bedTemp: 60 },
  Quality:  { layerHeight: '0.10', infillDensity: 20, infillPattern: 'Gyroid',      walls: 3, topLayers: 5, bottomLayers: 4, supportType: 'none', supportThreshold: 40, printSpeed: 100, travelSpeed: 200, nozzleTemp: 215, bedTemp: 60 },
  Speed:    { layerHeight: '0.30', infillDensity: 10, infillPattern: 'Rectilinear', walls: 2, topLayers: 3, bottomLayers: 2, supportType: 'none', supportThreshold: 50, printSpeed: 300, travelSpeed: 350, nozzleTemp: 225, bedTemp: 65 },
  Draft:    { layerHeight: '0.35', infillDensity:  5, infillPattern: 'Rectilinear', walls: 1, topLayers: 3, bottomLayers: 2, supportType: 'none', supportThreshold: 55, printSpeed: 350, travelSpeed: 400, nozzleTemp: 230, bedTemp: 65 },
}

const INFILL_PATTERNS = ['Rectilinear', 'Grid', 'Triangles', 'Tri-hexagon', 'Cubic', 'Cubic Subdivision', 'Gyroid', 'Honeycomb', 'Adaptive Cubic', 'Lightning']
const LAYER_HEIGHTS   = ['0.05', '0.08', '0.10', '0.12', '0.15', '0.20', '0.25', '0.28', '0.30', '0.35']
const MACHINES        = ['BambuA1', 'BambuA1Mini', 'BambuP1S', 'BambuX1C', 'PrusaMK4', 'PrusaMINI', 'CrealityEnder3', 'VoronTrident', 'Custom']
const SLICER_MATS     = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'NYLON', 'PLA-CF', 'PA-CF']
const MAT_TEMPS       = {
  PLA: { nozzle: 220, bed: 60 }, PETG: { nozzle: 240, bed: 80 },
  ABS: { nozzle: 250, bed: 100 }, TPU: { nozzle: 230, bed: 35 },
  ASA: { nozzle: 250, bed: 100 }, NYLON: { nozzle: 270, bed: 90 },
  'PLA-CF': { nozzle: 230, bed: 60 }, 'PA-CF': { nozzle: 280, bed: 100 },
}

const CONN_TYPES = [
  { value: 'manual',    label: 'Manual',        hint: 'Update status via API' },
  { value: 'bambu',     label: 'Bambu LAN',     hint: 'Bambu X1C/P1S/A1 via local MQTT' },
  { value: 'moonraker', label: 'Moonraker',     hint: 'Klipper printers via Mainsail/Fluidd' },
  { value: 'octoprint', label: 'OctoPrint',     hint: 'OctoPrint-compatible printers' },
]

const SPOOL_MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'NYLON', 'PLA-CF', 'PA-CF', 'RESIN', 'Other']

// ─── Primitives ───────────────────────────────────────────────────────────────

function Tag({ children, color = '#555', bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: bg || color + '18', color, border: `1px solid ${color}33`,
      letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap'
    }}>{children}</span>
  )
}

const inputStyle = (T) => ({
  background: T.bg, border: `1px solid ${T.border}`, color: T.text,
  padding: '7px 10px', borderRadius: 4, fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box',
})

function SectionHead({ children, action }) {
  const T = useT()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: T?.textDim ?? '#333', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{children}</div>
      {action}
    </div>
  )
}

function EmptyState({ icon = '○', title, hint }) {
  const T = useT()
  return (
    <div style={{
      border: `1px dashed ${T?.border ?? 'rgba(255,255,255,0.05)'}`, borderRadius: 8,
      padding: '32px 16px', textAlign: 'center'
    }}>
      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 11, color: T?.textDim ?? '#333', marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 9, color: T?.textFaint ?? '#222', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{hint}</div>}
    </div>
  )
}

function PulsingDot({ color, size = 8 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: color === '#00cc66' ? 'pulse 2s infinite' : 'none'
      }} />
    </span>
  )
}

function Pill({ value, label, color = '#888' }) {
  const T = useT()
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', color, fontWeight: 600 }}>{value ?? '—'}</div>
    </div>
  )
}

function ProgressBar({ pct, color = '#00cc66', height = 3 }) {
  const T = useT()
  return (
    <div style={{ height, background: T?.inputBg ?? '#111', borderRadius: height }}>
      <div style={{ width: `${Math.min(100, pct || 0)}%`, height: '100%', background: color, borderRadius: height, transition: 'width 0.5s' }} />
    </div>
  )
}

function StatCard({ label, value, sub, color = '#fff', icon, alert }) {
  const T = useT()
  return (
    <div style={{
      background: alert ? 'rgba(255,68,68,0.06)' : (T?.card ?? 'rgba(255,255,255,0.02)'),
      border: `1px solid ${alert ? '#ff444422' : (T?.border ?? 'rgba(255,255,255,0.06)')}`,
      borderRadius: 10, padding: '14px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 18, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: 9, color: T?.textDim ?? '#333', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

// ─── Printer Card ──────────────────────────────────────────────────────────────

function PrinterCard({ printer, onAction, onLivePoll, connType }) {
  const T = useT()
  const color = STATUS_COLOR[printer.status] || '#555'
  const pct = printer.progress_pct ?? 0
  const maintenanceHours = printer.hours_since_maintenance
  const maintColor = maintenanceHours == null ? (T?.textDim ?? '#333')
    : maintenanceHours > 200 ? '#ff4444' : maintenanceHours > 100 ? '#ff9800' : '#00cc66'
  const [polling, setPolling] = useState(false)

  const doLivePoll = async () => {
    setPolling(true)
    await onLivePoll(printer.id)
    setPolling(false)
  }

  return (
    <div style={{
      background: T?.card ?? 'rgba(255,255,255,0.015)', border: `1px solid ${color}1a`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulsingDot color={color} />
          <span style={{ fontSize: 12, color: T?.text ?? '#ddd', fontWeight: 600 }}>{printer.name}</span>
          {printer.model && <span style={{ fontSize: 9, color: T?.textDim ?? '#333' }}>{printer.model}</span>}
          {connType && connType !== 'manual' && (
            <Tag color="#4a9eff">{connType}</Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <Tag color={color}>{printer.status}</Tag>
          {connType && connType !== 'manual' && (
            <button onClick={doLivePoll} disabled={polling} style={{
              fontSize: 9, padding: '2px 8px', background: '#4a9eff12', border: '1px solid #4a9eff30',
              color: polling ? (T?.textDim ?? '#333') : '#4a9eff', cursor: polling ? 'default' : 'pointer', borderRadius: 3
            }}>{polling ? '...' : '↻ Live'}</button>
          )}
          {printer.status === 'printing' && (
            <button onClick={() => onAction(printer.id, 'pause')} style={{
              fontSize: 9, padding: '2px 8px', background: 'transparent',
              border: `1px solid ${T?.border ?? '#222'}`, color: T?.textDim ?? '#555', cursor: 'pointer', borderRadius: 3
            }}>⏸</button>
          )}
          {printer.status === 'paused' && (
            <button onClick={() => onAction(printer.id, 'resume')} style={{
              fontSize: 9, padding: '2px 8px', background: '#00cc6612',
              border: '1px solid #00cc6630', color: '#00cc66', cursor: 'pointer', borderRadius: 3
            }}>▶</button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 10, padding: '8px', background: T?.sectionBg ?? 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
        <Pill label="Nozzle" value={printer.nozzle_temp != null ? `${printer.nozzle_temp}°` : '—'} color={printer.nozzle_temp > 150 ? '#ff9800' : (T?.textDim ?? '#555')} />
        <Pill label="Bed" value={printer.bed_temp != null ? `${printer.bed_temp}°` : '—'} color={printer.bed_temp > 40 ? '#ff9800' : (T?.textDim ?? '#555')} />
        <Pill label="Progress" value={printer.status === 'printing' ? `${pct}%` : '—'} color="#00cc66" />
        <Pill label="Maint" value={maintenanceHours != null ? `${maintenanceHours}h` : '—'} color={maintColor} />
      </div>
      {printer.current_job && (
        <div style={{ fontSize: 9, color: T?.textDim ?? '#444', fontFamily: 'monospace', marginBottom: 8 }}>
          ⬡ {printer.current_job}
          {printer.layer_num && printer.total_layers && (
            <span style={{ color: T?.textFaint ?? '#2a2a2a', marginLeft: 8 }}>Layer {printer.layer_num}/{printer.total_layers}</span>
          )}
        </div>
      )}
      {printer.status === 'printing' && <ProgressBar pct={pct} color={color} />}
      {printer.eta_minutes != null && printer.status === 'printing' && (
        <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginTop: 4, textAlign: 'right' }}>
          ETA {printer.eta_minutes}min
        </div>
      )}
    </div>
  )
}

// ─── Connect Printer Form ─────────────────────────────────────────────────────

function ConnectPrinterForm({ onSave, onCancel, base }) {
  const T = useT()
  const [form, setForm] = useState({
    id: '', name: '', model: '', connection_type: 'manual',
    host: '', serial: '', access_code: '', api_key: '', material_type: 'PLA'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ct = form.connection_type

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.id.trim() || !form.name.trim()) { setError('ID and Name are required'); return }
    setSaving(true); setError(null)
    try {
      const r = await fetch(`${base}/api/v1/printers/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await r.json()
      if (data.error) setError(data.error)
      else onSave(data)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const inp = {
    background: T?.inputBg ?? '#0d0d0d', border: `1px solid ${T?.inputBorder ?? 'rgba(255,255,255,0.07)'}`,
    color: T?.text ?? '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 11,
    fontFamily: 'monospace', width: '100%'
  }

  return (
    <div style={{ background: T?.card ?? 'rgba(255,255,255,0.02)', border: `1px solid ${T?.border ?? 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
      <SectionHead>Connect New Printer</SectionHead>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>ID (unique key)</div>
          <input value={form.id} onChange={e => set('id', e.target.value)} placeholder="bambu-x1c-1" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>Display Name</div>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Bambu X1C #1" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>Model</div>
          <input value={form.model} onChange={e => set('model', e.target.value)} placeholder="BambuX1C" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>Default Material</div>
          <select value={form.material_type} onChange={e => set('material_type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {SLICER_MATS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 6 }}>Connection Type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CONN_TYPES.map(c => (
            <button key={c.value} onClick={() => set('connection_type', c.value)} style={{
              padding: '5px 12px', fontSize: 9, cursor: 'pointer', borderRadius: 5, fontWeight: 600,
              background: ct === c.value ? '#00cc6615' : 'transparent',
              color: ct === c.value ? '#00cc66' : (T?.textFaint ?? '#2a2a2a'),
              border: ct === c.value ? '1px solid #00cc6630' : `1px solid ${T?.border ?? '#1a1a1a'}`,
            }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginTop: 5 }}>
          {CONN_TYPES.find(c => c.value === ct)?.hint}
        </div>
      </div>

      {ct !== 'manual' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>
            {ct === 'bambu' ? 'Printer IP Address' : 'Host URL (e.g. http://192.168.1.50)'}
          </div>
          <input value={form.host} onChange={e => set('host', e.target.value)}
            placeholder={ct === 'bambu' ? '192.168.1.50' : 'http://192.168.1.50'} style={inp} />
        </div>
      )}

      {ct === 'bambu' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>Device Serial Number</div>
            <input value={form.serial} onChange={e => set('serial', e.target.value)}
              placeholder="01P00A123456789" style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>Access Code (from screen)</div>
            <input value={form.access_code} onChange={e => set('access_code', e.target.value)}
              type="password" placeholder="12345678" style={inp} />
          </div>
        </div>
      )}

      {ct === 'octoprint' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 4 }}>OctoPrint API Key</div>
          <input value={form.api_key} onChange={e => set('api_key', e.target.value)}
            type="password" placeholder="A1B2C3D4..." style={inp} />
        </div>
      )}

      {ct === 'bambu' && (
        <div style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid #4a9eff20', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 9, color: '#4a9eff', lineHeight: 1.7 }}>
          Bambu LAN Mode: On the printer touchscreen → Settings → WLAN → enable LAN Mode. The Access Code is shown below the IP address.
          Serial number is printed on the printer label or visible in Bambu Handy → Device → Settings.
        </div>
      )}

      {ct === 'moonraker' && (
        <div style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid #4a9eff20', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 9, color: '#4a9eff', lineHeight: 1.7 }}>
          Enter the host where Moonraker is running (Mainsail or Fluidd address). No API key required.
          Example: http://mainsail.local or http://192.168.1.100
        </div>
      )}

      {error && <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: '8px', background: saving ? (T?.inputBg ?? '#111') : '#00cc66', color: saving ? (T?.textDim ?? '#333') : '#000',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer'
        }}>{saving ? 'Connecting...' : '+ Add Printer'}</button>
        <button onClick={onCancel} style={{
          padding: '8px 14px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
          color: T?.textDim ?? '#333', borderRadius: 6, cursor: 'pointer', fontSize: 11
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Shopify Order Details (compact card subtitle) ────────────────────────────
// Shows on the collapsed card when the job originated from Shopify. Returns
// null for direct orders so their cards look unchanged.
function ShopifyOrderDetails({ job }) {
  const T = useT()
  if (!job || !job.shopify_order) return null
  const items = job.line_items || []
  const firstTwo = items.slice(0, 2)
  const moreCount = Math.max(0, items.length - 2)
  return (
    <div style={{
      marginTop: 6, paddingTop: 6,
      borderTop: `1px dashed ${T?.border ?? 'rgba(255,255,255,0.06)'}`
    }}>
      {/* Customer + order number */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9, color: T?.textDim ?? '#888', marginBottom: firstTwo.length > 0 ? 4 : 0
      }}>
        <span style={{
          fontSize: 8, padding: '1px 5px', borderRadius: 3,
          background: 'rgba(151,71,255,0.15)', color: '#9747ff',
          fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.04em'
        }}>SHOPIFY</span>
        <span style={{ fontFamily: 'monospace', color: T?.text ?? '#bbb', fontWeight: 600 }}>
          #{job.shopify_order}
        </span>
        {job.customer_name && (
          <span style={{ color: T?.textDim ?? '#777' }}>· {job.customer_name}</span>
        )}
      </div>
      {/* Line items preview (first 2) */}
      {firstTwo.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {firstTwo.map((li, i) => (
            <div key={i} style={{
              fontSize: 9, color: T?.textFaint ?? '#aaa',
              display: 'flex', alignItems: 'center', gap: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {li.title || 'Item'}
              </span>
              {li.sku && (
                <span style={{ color: T?.textFaint ?? '#555', fontFamily: 'monospace', fontSize: 8 }}>
                  {li.sku}
                </span>
              )}
              <span style={{ color: T?.textDim ?? '#777', fontFamily: 'monospace' }}>×{li.qty || 1}</span>
            </div>
          ))}
          {moreCount > 0 && (
            <div style={{ fontSize: 8, color: T?.textFaint ?? '#555', fontStyle: 'italic' }}>
              + {moreCount} more item{moreCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── Queue Card ────────────────────────────────────────────────────────────────

function QueueCard({ job, printers, onAssign, onCancel, onAdvance }) {
  const T = useT()
  const matColor = MAT_COLOR[job.material] || '#555'
  const [assigning, setAssigning] = useState(false)
  const idlePrinters = printers.filter(p => p.status === 'idle')
  const stageIdx = ORDER_STAGES.indexOf(job.status)
  const color = ORDER_COLOR[job.status] || '#444'
  const canAdvance = stageIdx >= 0 && stageIdx < ORDER_STAGES.length - 1
  const canBack = stageIdx > 0

  return (
    <div style={{
      background: T?.card ?? 'rgba(255,255,255,0.015)', border: `1px solid ${T?.border ?? 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: T?.text ?? '#ccc', fontFamily: 'monospace', fontWeight: 600, marginBottom: 3 }}>
            {job.name || job.spec_id || job.id || 'job'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <Tag color={matColor}>{job.material || 'PLA'}</Tag>
            {job.qty > 1 && <Tag color="#888">×{job.qty}</Tag>}
            {job.priority === 'high' && <Tag color="#ff4444">URGENT</Tag>}
            <Tag color={color}>{ORDER_ICON[job.status]} {job.status}</Tag>
          </div>
          <ShopifyOrderDetails job={job} />
        </div>
        <div style={{ textAlign: 'right' }}>
          {job.est_time_min && <div style={{ fontSize: 10, color: T?.textDim ?? '#555', fontFamily: 'monospace' }}>{job.est_time_min}min</div>}
          {job.est_cost && <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a' }}>${job.est_cost}</div>}
        </div>
      </div>

      {/* Stage progress bar */}
      {stageIdx >= 0 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
          {ORDER_STAGES.map((s, i) => (
            <div key={s} title={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : (T?.inputBg ?? '#111')
            }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Stage navigation */}
        {canBack && (
          <button onClick={() => onAdvance(job.id || job.spec_id, ORDER_STAGES[stageIdx - 1])} style={{
            fontSize: 9, padding: '3px 8px', background: 'transparent',
            border: `1px solid ${T?.border ?? '#1a1a1a'}`, color: T?.textDim ?? '#444', cursor: 'pointer', borderRadius: 3
          }}>← Back</button>
        )}
        {canAdvance && (
          <button onClick={() => onAdvance(job.id || job.spec_id, ORDER_STAGES[stageIdx + 1])} style={{
            fontSize: 9, padding: '3px 10px', background: '#00cc6612',
            border: '1px solid #00cc6630', color: '#00cc66', cursor: 'pointer', borderRadius: 3, fontWeight: 700
          }}>Next →</button>
        )}

        {/* Assign to printer (when PRINTING stage) */}
        {job.status === 'NEW' || job.status === 'AI_PREP' ? (
          assigning && idlePrinters.length > 0 ? (
            <>
              <span style={{ fontSize: 9, color: T?.textDim ?? '#444' }}>Assign to:</span>
              {idlePrinters.map(p => (
                <button key={p.id} onClick={() => { onAssign(job.id || job.spec_id, p.id); setAssigning(false) }} style={{
                  fontSize: 9, padding: '3px 8px', background: '#00cc6612', border: '1px solid #00cc6630',
                  color: '#00cc66', cursor: 'pointer', borderRadius: 3
                }}>{p.name}</button>
              ))}
              <button onClick={() => setAssigning(false)} style={{
                fontSize: 9, padding: '3px 6px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
                color: T?.textDim ?? '#333', cursor: 'pointer', borderRadius: 3
              }}>✕</button>
            </>
          ) : (
            <button onClick={() => setAssigning(true)} disabled={idlePrinters.length === 0} style={{
              fontSize: 9, padding: '3px 10px', background: idlePrinters.length > 0 ? '#4a9eff12' : (T?.inputBg ?? '#111'),
              border: `1px solid ${idlePrinters.length > 0 ? '#4a9eff30' : (T?.border ?? '#1a1a1a')}`,
              color: idlePrinters.length > 0 ? '#4a9eff' : (T?.textFaint ?? '#2a2a2a'),
              cursor: idlePrinters.length > 0 ? 'pointer' : 'default', borderRadius: 3
            }}>
              {idlePrinters.length > 0 ? '⬡ Assign Printer' : 'No idle printers'}
            </button>
          )
        ) : null}

        <button onClick={() => onCancel(job.id || job.spec_id)} style={{
          fontSize: 9, padding: '3px 8px', background: 'transparent', marginLeft: 'auto',
          border: `1px solid ${T?.border ?? '#1a1a1a'}`, color: T?.textDim ?? '#333', cursor: 'pointer', borderRadius: 3
        }}>✕</button>
      </div>
      {job.notes && <div style={{ fontSize: 9, color: T?.textDim ?? '#333', marginTop: 6, fontStyle: 'italic' }}>{job.notes}</div>}
    </div>
  )
}

// ─── Kanban Column + Card ─────────────────────────────────────────────────────

function KanbanCard({ job, stage, onMove, onCancel, onOpen }) {
  const T = useT()
  const matColor = MAT_COLOR[job.material] || '#555'
  const [dragOver, setDragOver] = useState(false)
  const [clickGuard, setClickGuard] = useState(false)

  const handleClick = () => {
    if (clickGuard) return
    if (onOpen) onOpen(job)
  }

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('jobId', job.id || job.spec_id); e.dataTransfer.setData('fromStage', stage); setClickGuard(true); setTimeout(()=>setClickGuard(false), 200) }}
      onClick={handleClick}
      style={{
        background: dragOver ? (T?.cardHover ?? 'rgba(255,255,255,0.04)') : (T?.card ?? 'rgba(255,255,255,0.02)'),
        border: `1px solid ${T?.border ?? 'rgba(255,255,255,0.06)'}`,
        borderRadius: 7, padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
        transition: 'background 0.1s'
      }}
    >
      <div style={{ fontSize: 10, color: T?.text ?? '#bbb', fontWeight: 600, marginBottom: 4, fontFamily: 'monospace' }}>
        {job.name || job.spec_id || job.id}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <Tag color={matColor}>{job.material || 'PLA'}</Tag>
        {job.qty > 1 && <Tag color="#888">×{job.qty}</Tag>}
        {job.priority === 'high' && <Tag color="#ff4444">!</Tag>}
      </div>
      <ShopifyOrderDetails job={job} />
      {job.est_time_min && <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', fontFamily: 'monospace' }}>{job.est_time_min}min</div>}
      {job.assigned_printer && <div style={{ fontSize: 8, color: '#4a9eff', marginTop: 2 }}>⬡ {job.assigned_printer}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {ORDER_STAGES.indexOf(stage) > 0 && (
          <button onClick={() => onMove(job.id || job.spec_id, ORDER_STAGES[ORDER_STAGES.indexOf(stage) - 1])} style={{
            fontSize: 8, padding: '2px 6px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
            color: T?.textDim ?? '#444', cursor: 'pointer', borderRadius: 3
          }}>←</button>
        )}
        {ORDER_STAGES.indexOf(stage) < ORDER_STAGES.length - 1 && (
          <button onClick={() => onMove(job.id || job.spec_id, ORDER_STAGES[ORDER_STAGES.indexOf(stage) + 1])} style={{
            fontSize: 8, padding: '2px 6px', background: '#00cc6610', border: '1px solid #00cc6620',
            color: '#00cc66', cursor: 'pointer', borderRadius: 3
          }}>→</button>
        )}
        <button onClick={() => onCancel(job.id || job.spec_id)} style={{
          fontSize: 8, padding: '2px 5px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
          color: T?.textFaint ?? '#2a2a2a', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto'
        }}>✕</button>
      </div>
    </div>
  )
}

function KanbanColumn({ stage, jobs, onMove, onCancel, onDrop, onOpen }) {
  const T = useT()
  const [dragOver, setDragOver] = useState(false)
  const color = ORDER_COLOR[stage] || '#444'
  const icon = ORDER_ICON[stage] || '○'

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        const jobId = e.dataTransfer.getData('jobId')
        const from = e.dataTransfer.getData('fromStage')
        if (jobId && from !== stage) onDrop(jobId, stage)
      }}
      style={{
        minWidth: 180, flex: '1 1 180px',
        background: dragOver ? `${color}08` : (T?.sectionBg ?? 'rgba(0,0,0,0.2)'),
        border: `1px solid ${dragOver ? color + '30' : (T?.border ?? 'rgba(255,255,255,0.05)')}`,
        borderRadius: 8, padding: '10px 10px 6px', transition: 'all 0.15s'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color }}>{icon}</span>
          <span style={{ fontSize: 9, color: T?.textDim ?? '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stage.replace('_', ' ')}</span>
        </div>
        {jobs.length > 0 && (
          <span style={{ fontSize: 9, background: color + '22', color, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{jobs.length}</span>
        )}
      </div>
      {jobs.length === 0 ? (
        <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, color: T?.textFaint ?? '#1a1a1a' }}>drop here</span>
        </div>
      ) : (
        jobs.map(job => (
          <KanbanCard key={job.id || job.spec_id} job={job} stage={stage} onMove={onMove} onCancel={onCancel} onOpen={onOpen} />
        ))
      )}
    </div>
  )
}

// ─── Enlarged Card Modal (production UI) ─────────────────────────────────────

// ─── Comment Thread (per-order chat) ─────────────────────────────────────────
function CommentThread({ orderId, apiUrl, authUser }) {
  const T = useT()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchComments = async () => {
    try {
      const r = await fetch(`${apiUrl}/api/v1/farm/orders/${orderId}/comments`)
      if (r.ok) {
        const d = await r.json()
        setComments(d.comments || [])
      }
    } catch (e) { /* network errors are fine — polling will retry */ }
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()
    const handle = setInterval(fetchComments, 5000)
    return () => clearInterval(handle)
  }, [orderId, apiUrl])

  const sendComment = async () => {
    if (!text.trim()) return
    setPosting(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('pd_token')
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(`${apiUrl}/api/v1/farm/orders/${orderId}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: text.trim() }),
      })
      setText('')
      fetchComments()
    } catch (e) { /* show error inline */ }
    setPosting(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendComment()
    }
  }

  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [comments.length])

  if (loading) return <div style={{ padding: 8, color: T?.textDim ?? '#777', fontSize: 10 }}>Loading comments…</div>

  return (
    <div>
      <SectionHead>Comments ({comments.length})</SectionHead>
      <div ref={scrollRef} style={{
        maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
        padding: 4, marginBottom: 6,
        background: T?.sectionBg ?? '#111', borderRadius: 6,
      }}>
        {comments.length === 0 && (
          <div style={{ padding: 8, color: T?.textFaint ?? '#555', fontSize: 10, textAlign: 'center' }}>
            No comments yet — start the conversation
          </div>
        )}
        {comments.map(c => {
          const isMine = c.author_id === (authUser?.email || authUser?.partner_id)
          const roleColor = c.author_role === 'admin' ? '#4a9eff' : c.author_role === 'customer' ? '#ff9800' : '#00cc66'
          return (
            <div key={c.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMine ? 'flex-end' : 'flex-start',
              gap: 2,
            }}>
              <div style={{
                maxWidth: '85%', padding: '6px 10px', borderRadius: 8,
                background: isMine ? 'rgba(0,204,102,0.1)' : (T?.inputBg ?? '#0d0d0d'),
                border: `1px solid ${isMine ? 'rgba(0,204,102,0.15)' : (T?.border ?? '#1a1a1a')}`,
                fontSize: 11, color: T?.text ?? '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {!isMine && (
                  <div style={{ fontSize: 9, color: roleColor, fontWeight: 600, marginBottom: 2 }}>
                    {c.author_name || 'Unknown'} · {c.author_role}
                  </div>
                )}
                {c.text}
              </div>
              <div style={{ fontSize: 8, color: T?.textFaint ?? '#555', marginRight: isMine ? 4 : 0, marginLeft: isMine ? 0 : 4 }}>
                {(c.created_at || '').slice(11, 16)}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a comment…"
          disabled={posting}
          style={{
            flex: 1, padding: '6px 10px', fontSize: 11,
            background: T?.inputBg ?? '#0d0d0d', border: `1px solid ${T?.inputBorder ?? '#1a1a1a'}`,
            borderRadius: 5, color: T?.text ?? '#ccc', outline: 'none',
          }}
        />
        <button onClick={sendComment} disabled={posting || !text.trim()} style={{
          fontSize: 11, padding: '6px 14px', background: '#00cc6615', border: '1px solid #00cc6640',
          color: '#00cc66', cursor: posting || !text.trim() ? 'default' : 'pointer', borderRadius: 5, fontWeight: 600,
        }}>{posting ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}

// ─── Photo Upload Button (one-tap camera + thumbnail strip) ───────────────────
function PhotoUploadButton({ orderId, apiUrl, onUploaded }) {
  const T = useT()
  const photoRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleClick = () => {
    if (photoRef.current) photoRef.current.click()
  }

  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', 'photo')
      fd.append('uploaded_by', localStorage.getItem('pd_user_email') || 'partner_dashboard')
      fd.append('note', 'photo via camera button')
      const headers = {}
      const token = localStorage.getItem('pd_token')
      if (token) headers['Authorization'] = `Bearer ${token}`
      const r = await fetch(`${apiUrl}/api/v1/farm/orders/${orderId}/attachments`, {
        method: 'POST', body: fd, headers,
      })
      const d = await r.json()
      if (d.ok) {
        if (onUploaded) onUploaded(d.attachment)
      } else {
        setError(d.error || 'Upload failed')
      }
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
    // Reset input so the same file can be re-selected
    if (photoRef.current) photoRef.current.value = ''
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button onClick={handleClick} disabled={uploading} style={{
        fontSize: 11, padding: '8px 14px', background: '#00cc6615', border: '1px solid #00cc6640',
        color: '#00cc66', cursor: uploading ? 'default' : 'pointer', borderRadius: 5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {uploading ? '⏳ Uploading…' : '📷 Photo'}
      </button>
      {error && <div style={{ fontSize: 9, color: '#ff8888' }}>{error}</div>}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

function EnlargedCardModal({ order, fileResolve, attachments, busy, error, onClose, onUpload3D, onUploadPhoto, onUploadDoc, onFileSelected, fileInputRef, photoInputRef, docInputRef, onMake, onMarkFinished, onReportError, onMarkRedo, refreshAttachments, apiUrl, authUser }) {
  const T = useT()
  if (!order) return null

  const matColor = MAT_COLOR[order.material] || '#555'
  const stageColor = ORDER_COLOR[order.status] || '#444'
  const stageIdx = ORDER_STAGES.indexOf(order.status)
  const needsRedo = order.needs_redo
  const resolved = fileResolve
  const lineItems = order.line_items || []
  const attachmentsList = attachments || []
  const photos = attachmentsList.filter(a => a.kind === 'photo')
  const docs = attachmentsList.filter(a => a.kind === 'document' || a.kind === '3d_model' || a.kind === 'sliced_3mf')

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T?.bg ?? '#0a0a0a', border: `1px solid ${T?.border ?? '#222'}`,
        borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T?.border ?? '#1a1a1a'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: T?.bg ?? '#0a0a0a', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, color: T?.text ?? '#fff', fontWeight: 700, fontFamily: 'monospace' }}>{order.name || order.spec_id || order.id}</span>
              <Tag color={matColor}>{order.material || 'PLA'}</Tag>
              {order.qty > 1 && <Tag color="#888">×{order.qty}</Tag>}
              <Tag color={stageColor}>{ORDER_ICON[order.status]} {order.status}</Tag>
              {needsRedo && <Tag color="#ff4444">REDO</Tag>}
            </div>
            <div style={{ fontSize: 10, color: T?.textDim ?? '#777' }}>
              {order.customer_name} · {order.shopify_order || ''} · {order.source || 'direct'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T?.textDim ?? '#888',
            fontSize: 20, cursor: 'pointer', padding: '0 8px',
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #ff444440', color: '#ff8888', padding: 10, borderRadius: 6, fontSize: 11 }}>
              {error}
            </div>
          )}

          {/* Stage progress */}
          {stageIdx >= 0 && (
            <div>
              <SectionHead>Pipeline</SectionHead>
              <div style={{ display: 'flex', gap: 2 }}>
                {ORDER_STAGES.map((s, i) => (
                  <div key={s} title={s} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : (T?.inputBg ?? '#111'),
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {(order.note || order.line_items?.length > 0) && (
            <div>
              <SectionHead>Description</SectionHead>
              {order.note && <div style={{ fontSize: 11, color: T?.text ?? '#ccc', padding: 8, background: T?.sectionBg ?? '#111', borderRadius: 6, marginBottom: 8, fontStyle: 'italic' }}>{order.note}</div>}
              {lineItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {lineItems.map((li, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: T?.sectionBg ?? '#111', borderRadius: 5, fontSize: 11 }}>
                      <span style={{ color: T?.text ?? '#ddd', fontWeight: 600 }}>{li.title || 'Item'}</span>
                      {li.sku && <span style={{ color: T?.textFaint ?? '#555', fontFamily: 'monospace', fontSize: 10 }}>{li.sku}</span>}
                      <span style={{ marginLeft: 'auto', color: T?.textDim ?? '#777' }}>×{li.qty || 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3D File */}
          <div>
            <SectionHead action={
              <button onClick={() => onUpload3D()} disabled={busy} style={{
                fontSize: 9, padding: '3px 10px', background: '#4a9eff12', border: '1px solid #4a9eff30',
                color: '#4a9eff', cursor: busy ? 'default' : 'pointer', borderRadius: 3,
              }}>{busy ? '…' : '+ Upload STL'}</button>
            }>3D File</SectionHead>
            {resolved && resolved.ok ? (
              <div style={{ padding: 10, background: T?.sectionBg ?? '#111', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⬡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T?.text ?? '#ddd', fontWeight: 600 }}>{resolved.name}</div>
                  <div style={{ fontSize: 9, color: T?.textDim ?? '#777', fontFamily: 'monospace' }}>
                    source: {resolved.source}
                    {resolved.size_bytes ? ` · ${(resolved.size_bytes / 1024).toFixed(1)} KB` : ''}
                    {resolved.mime ? ` · ${resolved.mime}` : ''}
                  </div>
                </div>
                <a href={resolved.url?.startsWith('http') ? resolved.url : `${apiUrl}${resolved.url}`}
                   target="_blank" rel="noopener noreferrer"
                   download={resolved.name}
                   style={{
                     fontSize: 10, padding: '4px 10px', background: '#00cc6612', border: '1px solid #00cc6630',
                     color: '#00cc66', textDecoration: 'none', borderRadius: 3, fontWeight: 600,
                   }}>↓ Download</a>
              </div>
            ) : (
              <div style={{ padding: 10, background: T?.sectionBg ?? '#111', borderRadius: 6, fontSize: 10, color: T?.textDim ?? '#777' }}>
                {resolved ? (
                  <>
                    <div>No 3D file resolved automatically.</div>
                    <div style={{ marginTop: 4, color: T?.textFaint ?? '#555' }}>reason: {resolved.reason || resolved.source || 'unknown'}</div>
                  </>
                ) : (
                  <div>Resolving…</div>
                )}
              </div>
            )}
          </div>

          {/* Attachments list */}
          {attachmentsList.length > 0 && (
            <div>
              <SectionHead>Attachments ({attachmentsList.length})</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {attachmentsList.map(att => {
                  const url = att.download_url?.startsWith('http') ? att.download_url : `${apiUrl}${att.download_url}`
                  const isPhoto = att.kind === 'photo'
                  return (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: T?.sectionBg ?? '#111', borderRadius: 5 }}>
                      <Tag color={att.kind === '3d_model' ? '#4a9eff' : att.kind === 'photo' ? '#00cc66' : '#888'}>
                        {att.kind}
                      </Tag>
                      {isPhoto && <img src={url} alt={att.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 3, border: '1px solid #00cc6630' }} />}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 11, color: T?.text ?? '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                        <div style={{ fontSize: 9, color: T?.textFaint ?? '#555' }}>
                          {att.uploaded_by || 'unknown'} · {att.size_bytes ? `${(att.size_bytes / 1024).toFixed(1)} KB` : '—'} · {(att.uploaded_at || '').slice(0, 16)}
                        </div>
                      </div>
                      <a href={url} target="_blank" rel="noopener noreferrer" download={att.name} style={{
                        fontSize: 9, padding: '3px 8px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
                        color: T?.textDim ?? '#777', textDecoration: 'none', borderRadius: 3,
                      }}>↓</a>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Comments thread */}
          <CommentThread orderId={order.id || order.spec_id} apiUrl={apiUrl} authUser={authUser} />

          {/* Print history */}
          {order.print_history && order.print_history.length > 0 && (
            <div>
              <SectionHead>Print History</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {order.print_history.map((ph, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: T?.sectionBg ?? '#111', borderRadius: 5, fontSize: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: ph.error_text ? 4 : 0 }}>
                      <Tag color={ph.status === 'succeeded' ? '#00cc66' : ph.status === 'failed' ? '#ff4444' : '#4a9eff'}>
                        {ph.status}
                      </Tag>
                      <span style={{ color: T?.textDim ?? '#777' }}>
                        {(ph.started_at || '').slice(0, 19)}
                      </span>
                      {ph.started_by && <span style={{ color: T?.textFaint ?? '#555' }}>by {ph.started_by}</span>}
                    </div>
                    {ph.error_text && <div style={{ color: '#ff8888', fontStyle: 'italic' }}>⚠ {ph.error_text}</div>}
                    {ph.notes && <div style={{ color: T?.textDim ?? '#777' }}>{ph.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin notes (visible to partner — important for partner to see admin's instructions) */}
          {order.admin_notes && (
            <div>
              <SectionHead>Admin Notes</SectionHead>
              <div style={{ padding: 10, background: 'rgba(255,152,0,0.06)', border: '1px solid #ff980030', borderRadius: 6, fontSize: 11, color: '#ffcc88', whiteSpace: 'pre-wrap' }}>
                {order.admin_notes}
              </div>
            </div>
          )}

          {order.packing_notes && (
            <div>
              <SectionHead>Packing Notes</SectionHead>
              <div style={{ padding: 10, background: T?.sectionBg ?? '#111', borderRadius: 6, fontSize: 11, color: T?.text ?? '#ccc' }}>
                {order.packing_notes}
              </div>
            </div>
          )}
        </div>

        {/* Footer / Action bar */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T?.border ?? '#1a1a1a'}`, display: 'flex', gap: 8, flexWrap: 'wrap', position: 'sticky', bottom: 0, background: T?.bg ?? '#0a0a0a' }}>
          {/* Make button — partner presses when starting the print */}
          <button onClick={onMake} disabled={busy} style={{
            fontSize: 11, padding: '8px 14px', background: '#00cc6615', border: '1px solid #00cc6640',
            color: '#00cc66', cursor: busy ? 'default' : 'pointer', borderRadius: 5, fontWeight: 700,
          }}>▶ Make (start print)</button>

          {/* Report error */}
          <button onClick={onReportError} disabled={busy} style={{
            fontSize: 11, padding: '8px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff444440',
            color: '#ff8888', cursor: busy ? 'default' : 'pointer', borderRadius: 5, fontWeight: 600,
          }}>⚠ Report Error</button>

          {/* Upload photo + mark finished */}
          <PhotoUploadButton orderId={order.id || order.spec_id} apiUrl={apiUrl} onUploaded={() => refreshAttachments(order.id || order.spec_id)} />
          <button onClick={onUploadPhoto} disabled={busy} style={{
            fontSize: 11, padding: '8px 14px', background: '#4a9eff12', border: '1px solid #4a9eff30',
            color: '#4a9eff', cursor: busy ? 'default' : 'pointer', borderRadius: 5, fontWeight: 600,
          }}>📷 Upload + Finish</button>
          <button onClick={onMarkFinished} disabled={busy} style={{
            fontSize: 11, padding: '8px 14px', background: '#00cc6615', border: '1px solid #00cc6640',
            color: '#00cc66', cursor: busy ? 'default' : 'pointer', borderRadius: 5, fontWeight: 600,
          }}>✓ Mark Finished</button>

          {/* Upload other doc */}
          <button onClick={onUploadDoc} disabled={busy} style={{
            fontSize: 11, padding: '8px 14px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
            color: T?.textDim ?? '#888', cursor: busy ? 'default' : 'pointer', borderRadius: 5,
          }}>+ Add Document</button>

          {/* Mark redo (operator) */}
          {needsRedo && (
            <button onClick={onMarkRedo} disabled={busy} style={{
              fontSize: 11, padding: '8px 14px', background: 'rgba(255,152,0,0.15)', border: '1px solid #ff980040',
              color: '#ffaa44', cursor: busy ? 'default' : 'pointer', borderRadius: 5, fontWeight: 700,
              marginLeft: 'auto',
            }}>↻ Mark Redo</button>
          )}
        </div>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept=".stl,.3mf,.obj,.step,.stp" onChange={onFileSelected} style={{ display: 'none' }} />
        <input ref={photoInputRef} type="file" accept="image/*" onChange={onFileSelected} style={{ display: 'none' }} />
        <input ref={docInputRef} type="file" onChange={onFileSelected} style={{ display: 'none' }} />
      </div>
    </div>
  )
}


// ─── Filament Spool Card ────────────────────────────────────────────────────────

function SpoolCard({ spool, onDelete, onEdit }) {
  const T = useT()
  const color = MAT_COLOR[spool.material] || '#888'
  const pct = spool.remaining_pct ?? (spool.remaining_g && spool.total_g ? Math.round((spool.remaining_g / spool.total_g) * 100) : null)
  const low = pct != null && pct < 20

  return (
    <div style={{
      background: low ? 'rgba(255,68,68,0.06)' : (T?.card ?? 'rgba(255,255,255,0.02)'),
      border: `1px solid ${low ? '#ff444422' : (T?.border ?? 'rgba(255,255,255,0.05)')}`,
      borderRadius: 8, padding: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: spool.hex_color || color, flexShrink: 0, border: `1px solid ${T?.border ?? 'rgba(255,255,255,0.1)'}` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: T?.text ?? '#ccc', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {spool.brand ? `${spool.brand} ` : ''}{spool.material}
          </div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#333' }}>{spool.color_name || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {low && <Tag color="#ff4444">LOW</Tag>}
        </div>
      </div>
      {pct != null && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: T?.textDim ?? '#333' }}>Remaining</span>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: low ? '#ff4444' : color }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={low ? '#ff4444' : color} height={4} />
          {spool.remaining_g != null && (
            <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginTop: 4 }}>
              {spool.remaining_g}g / {spool.total_g}g · ${((spool.remaining_g * (spool.cost_per_g || 0.025))).toFixed(2)} value
            </div>
          )}
        </>
      )}
      {spool.assigned_printer && (
        <div style={{ fontSize: 8, color: '#4a9eff', marginTop: 4 }}>⬡ {spool.assigned_printer}</div>
      )}
      {spool.notes && <div style={{ fontSize: 8, color: T?.textFaint ?? '#2a2a2a', marginTop: 3, fontStyle: 'italic' }}>{spool.notes}</div>}
      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
        <button onClick={() => onEdit && onEdit(spool)} style={{
          fontSize: 8, padding: '2px 8px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`, color: T?.textDim ?? '#444', cursor: 'pointer', borderRadius: 3
        }}>Edit</button>
        <button onClick={() => onDelete && onDelete(spool.id)} style={{
          fontSize: 8, padding: '2px 8px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`, color: '#ff444466', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto'
        }}>Remove</button>
      </div>
    </div>
  )
}

// ─── Add Spool Form ───────────────────────────────────────────────────────────

function AddSpoolForm({ onSave, onCancel, base, initialData, printers }) {
  const T = useT()
  const [form, setForm] = useState(initialData || {
    material: 'PLA', brand: '', color_name: '', hex_color: '#00cc66',
    total_g: 1000, remaining_g: 1000, cost_per_g: 0.025, assigned_printer: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = {
    background: T?.inputBg ?? '#0d0d0d', border: `1px solid ${T?.inputBorder ?? 'rgba(255,255,255,0.07)'}`,
    color: T?.text ?? '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 11,
    fontFamily: 'monospace', width: '100%'
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body = { ...form, total_g: Number(form.total_g), remaining_g: Number(form.remaining_g), cost_per_g: Number(form.cost_per_g) }
      const url = initialData?.id
        ? `${base}/api/v1/farm/inventory/${initialData.id}`
        : `${base}/api/v1/farm/inventory`
      const method = initialData?.id ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      onSave(await r.json())
    } catch { /* noop */ }
    setSaving(false)
  }

  return (
    <div style={{ background: T?.card ?? 'rgba(255,255,255,0.02)', border: `1px solid ${T?.border ?? 'rgba(255,255,255,0.07)'}`, borderRadius: 9, padding: 16, marginBottom: 14 }}>
      <SectionHead>{initialData ? 'Edit Spool' : 'Add Filament Spool'}</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Material</div>
          <select value={form.material} onChange={e => set('material', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {SPOOL_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Brand</div>
          <input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Bambu Lab" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Color Name</div>
          <input value={form.color_name} onChange={e => set('color_name', e.target.value)} placeholder="Bambu Green" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Color</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={form.hex_color} onChange={e => set('hex_color', e.target.value)}
              style={{ width: 36, height: 32, border: 'none', padding: 2, background: 'transparent', cursor: 'pointer' }} />
            <input value={form.hex_color} onChange={e => set('hex_color', e.target.value)} style={{ ...inp, flex: 1 }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Total Weight (g)</div>
          <input type="number" value={form.total_g} onChange={e => set('total_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Remaining (g)</div>
          <input type="number" value={form.remaining_g} onChange={e => set('remaining_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Cost per gram ($)</div>
          <input type="number" step="0.001" value={form.cost_per_g} onChange={e => set('cost_per_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Assign to Printer</div>
          <select value={form.assigned_printer || ''} onChange={e => set('assigned_printer', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">— Unassigned —</option>
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T?.textDim ?? '#444', marginBottom: 3 }}>Notes</div>
        <input value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." style={inp} />
      </div>
      {/* Cost preview */}
      <div style={{ fontSize: 9, color: T?.textFaint ?? '#2a2a2a', marginBottom: 10 }}>
        Estimated value: ${(Number(form.remaining_g) * Number(form.cost_per_g)).toFixed(2)}
        {' · '}
        Total spool: ${(Number(form.total_g) * Number(form.cost_per_g)).toFixed(2)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: '7px', background: saving ? (T?.inputBg ?? '#111') : '#00cc66', color: saving ? (T?.textDim ?? '#333') : '#000',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer'
        }}>{saving ? 'Saving...' : initialData ? 'Save Changes' : '+ Add Spool'}</button>
        <button onClick={onCancel} style={{
          padding: '7px 14px', background: 'transparent', border: `1px solid ${T?.border ?? '#1a1a1a'}`,
          color: T?.textDim ?? '#333', borderRadius: 6, cursor: 'pointer', fontSize: 11
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ alert }) {
  const T = useT()
  const color = alert.severity === 'error' ? '#ff4444' : alert.severity === 'warn' ? '#ff9800' : '#4a9eff'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      background: color + '08', border: `1px solid ${color}20`, borderRadius: 7, marginBottom: 6
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>
        {alert.severity === 'error' ? '🔴' : alert.severity === 'warn' ? '🟡' : 'ℹ️'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: T?.text ?? '#ccc', fontWeight: 600, marginBottom: 2 }}>{alert.title}</div>
        <div style={{ fontSize: 9, color: T?.textDim ?? '#444', lineHeight: 1.6 }}>{alert.message}</div>
        {alert.ts && <div style={{ fontSize: 8, color: T?.textFaint ?? '#2a2a2a', marginTop: 3 }}>{new Date(alert.ts).toLocaleTimeString()}</div>}
      </div>
    </div>
  )
}

// ─── Slice Card ────────────────────────────────────────────────────────────────

function SliceCard({ entry }) {
  const T = useT()
  const flagged = entry.flagged_for_review
  const timeDiff = entry.actual_time_seconds && entry.claimed_time_seconds
    ? Math.round(((entry.actual_time_seconds - entry.claimed_time_seconds) / entry.claimed_time_seconds) * 100) : null
  return (
    <div style={{
      background: T?.card ?? 'rgba(255,255,255,0.015)',
      border: `1px solid ${flagged ? '#ff980022' : (T?.border ?? 'rgba(255,255,255,0.05)')}`,
      borderRadius: 8, padding: '11px 13px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: T?.textDim ?? '#aaa', fontFamily: 'monospace' }}>{entry.spec_id || 'slice'}</span>
        <Tag color={flagged ? '#ff9800' : '#00cc66'}>{flagged ? '⚠ FLAGGED' : '✓ PASS'}</Tag>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '6px' }}>
        {[
          ['Material', entry.material || '—'],
          ['Machine',  entry.machine_class || '—'],
          ['Time',     entry.actual_time_seconds != null ? `${Math.round(entry.actual_time_seconds / 60)}min` : '—'],
          ['Weight',   entry.actual_weight_grams != null ? `${entry.actual_weight_grams}g` : '—'],
          ['Δ Time',   timeDiff != null ? `${timeDiff > 0 ? '+' : ''}${timeDiff}%` : '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 8, color: T?.textFaint ?? '#2a2a2a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
            <div style={{ fontSize: 10, color: k === 'Δ Time' && timeDiff && Math.abs(timeDiff) > 10 ? '#ff9800' : (T?.textDim ?? '#888'), fontFamily: 'monospace', marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 7, fontSize: 8, color: T?.textFaint ?? '#1e1e1e' }}>{new Date(entry.received_at).toLocaleString()}</div>
    </div>
  )
}

// ─── Order Row ─────────────────────────────────────────────────────────────────

function OrderRow({ order }) {
  const T = useT()
  const stageIdx = ORDER_STAGES.indexOf(order.status)
  const color = ORDER_COLOR[order.status] || '#444'
  const matColor = MAT_COLOR[order.material] || '#555'
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${T?.border ?? 'rgba(255,255,255,0.03)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: T?.text ?? '#bbb', fontFamily: 'monospace', fontWeight: 600 }}>{order.name || order.spec_id || order.id}</span>
          <Tag color={matColor}>{order.material || 'PLA'}</Tag>
          {order.qty > 1 && <span style={{ fontSize: 9, color: T?.textDim ?? '#333' }}>×{order.qty}</span>}
        </div>
        <Tag color={color}>{order.status || 'NEW'}</Tag>
      </div>
      {stageIdx >= 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {ORDER_STAGES.map((s, i) => (
            <div key={s} title={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : (T?.inputBg ?? '#111')
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Analytics helpers ─────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color = '#00cc66', unit = '' }) {
  const T = useT()
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: T?.textDim ?? '#555' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color }}>{value}{unit}</span>
      </div>
      <ProgressBar pct={pct} color={color} height={4} />
    </div>
  )
}

// ─── Slicer UI helpers ────────────────────────────────────────────────────────

function DropZone({ file, onFile }) {
  const T = useT()
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f && /\.(stl|3mf|obj)$/i.test(f.name)) onFile(f)
  }
  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        border: `1px dashed ${dragging ? '#00cc66' : file ? '#00cc6644' : (T?.border ?? '#1e1e1e')}`,
        borderRadius: 8, padding: 14, cursor: 'pointer', textAlign: 'center',
        background: dragging ? '#00cc6608' : file ? '#00cc6603' : (T?.sectionBg ?? 'rgba(255,255,255,0.01)'),
        transition: 'all 0.15s', marginBottom: 14
      }}
    >
      <input ref={inputRef} type="file" accept=".stl,.3mf,.obj" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <>
          <div style={{ fontSize: 18, marginBottom: 4 }}>📄</div>
          <div style={{ fontSize: 10, color: '#00cc66', fontFamily: 'monospace', wordBreak: 'break-all' }}>{file.name}</div>
          <div style={{ fontSize: 9, color: T?.textDim ?? '#333', marginTop: 3 }}>{(file.size / 1024).toFixed(0)} KB · click to change</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, opacity: 0.12, marginBottom: 6 }}>⬆</div>
          <div style={{ fontSize: 10, color: T?.textFaint ?? '#2a2a2a' }}>Drop STL / 3MF / OBJ or click to browse</div>
          <div style={{ fontSize: 9, color: T?.textFaint ?? '#1a1a1a', marginTop: 3 }}>or slice the last generated design below</div>
        </>
      )}
    </div>
  )
}

function SlicerParam({ label, children }) {
  const T = useT()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 9, color: T?.textDim ?? '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.08em', width: 100, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
// Server-driven farm-wide metrics panel. Receives the full payload from
// GET /api/v1/farm/analytics and renders 6 KPI cards plus breakdowns.
// Shows "no data" instead of 0 for metrics without enough samples.

function MetricCard({ label, value, sub, color = '#00cc66', icon }) {
  const T = { text: '#e0e0e0', textDim: '#999', textFaint: '#555' } // local fallback; Dashboard passes full T via props if needed
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{ fontSize: 9, color: T.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.textFaint }}>{sub}</div>}
    </div>
  )
}

function AnalyticsPanel({ data, T }) {
  const sales = data.sales || {}
  const waste = data.waste || {}
  const quality = data.quality || {}
  const speed = data.speed || {}
  const at = data.assigned_time || {}
  const dt = data.delivery_time || {}
  const bd = data.breakdowns || {}

  const fmt = {
    rupee: (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`,
    minutes: (n) => n == null ? '—' : `${Math.round(n)} min`,
    hours: (n) => n == null ? '—' : `${n} h`,
    pct: (n) => n == null ? '—' : `${Math.round(n * 100)}%`,
    count: (n) => n == null ? '—' : `${n}`,
    ratio: (n) => n == null ? '—' : `${n}×`,
  }

  return (
    <div>
      {/* Generated-at stamp */}
      <div style={{ fontSize: 9, color: T.textFaint, fontFamily: 'monospace', marginBottom: 10 }}>
        Generated {new Date(data.generated_at).toLocaleString()} · {data.total_orders} orders
      </div>

      {/* Primary KPIs (the 5 you asked for) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <MetricCard
          icon="₹" label="Total sales" color="#00cc66"
          value={fmt.rupee(sales.total_inr)}
          sub={`${sales.completed_orders || 0} completed · ${fmt.rupee(sales.avg_inr_per_order)} avg`}
        />
        <MetricCard
          icon="✗" label="Total waste" color={waste.failed_attempts > 0 ? '#ff9800' : '#00cc66'}
          value={`${waste.failed_attempts || 0} failed`}
          sub={`${waste.orders_with_failures || 0} orders · ${fmt.pct(waste.failure_rate)} failure rate`}
        />
        <MetricCard
          icon="★" label="Avg order quality" color="#9747ff"
          value={quality.average_score == null ? '—' : `${quality.average_score} / 5`}
          sub={`${quality.scored_orders || 0} scored`}
        />
        <MetricCard
          icon="⚡" label="Work speed" color={speed.avg_speed_ratio != null && speed.avg_speed_ratio < 1 ? '#00cc66' : '#ff9800'}
          value={fmt.ratio(speed.avg_speed_ratio)}
          sub={`${speed.samples || 0} samples · ${speed.faster_than_estimate || 0} faster`}
        />
        <MetricCard
          icon="⏱" label="Assigned time" color="#4a9eff"
          value={fmt.minutes(at.avg_minutes)}
          sub={`median ${fmt.minutes(at.median_minutes)} · ${at.samples || 0} orders`}
        />
        <MetricCard
          icon="📦" label="Delivery time" color="#00cc66"
          value={fmt.hours(dt.avg_hours)}
          sub={`median ${fmt.hours(dt.median_minutes ? dt.median_minutes / 60 : null)} · ${dt.samples || 0} orders`}
        />
      </div>

      {/* Quality distribution + top errors */}
      {quality.scored_orders > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHead>Quality distribution ({quality.scored_orders} orders scored)</SectionHead>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
            {Object.entries(quality.distribution || {}).reverse().map(([stars, count]) => {
              const max = Math.max(1, ...Object.values(quality.distribution || {}))
              const h = (count / max) * 50
              return (
                <div key={stars} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: h, background: stars === '5' ? '#00cc66' : stars === '4' ? '#4a9eff' : stars === '3' ? '#ff9800' : '#ff4444',
                    borderRadius: '3px 3px 0 0', margin: '0 auto', width: '60%'
                  }} title={`${stars} stars: ${count} orders`} />
                  <div style={{ fontSize: 8, color: T.textFaint, marginTop: 4 }}>{stars}★ {count}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top errors (from print_history failures) */}
      {waste.top_errors && waste.top_errors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHead>Top print errors</SectionHead>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
            {waste.top_errors.map(([err, count], i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                fontSize: 11, color: T.text, borderBottom: i < waste.top_errors.length - 1 ? `1px solid ${T.border}` : 'none'
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{err}</span>
                <span style={{ fontFamily: 'monospace', color: '#ff9800', marginLeft: 8 }}>×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <SectionHead>By status</SectionHead>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
            {Object.entries(bd.by_status || {}).map(([s, c]) => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                <span style={{ color: T.text }}>{s}</span>
                <span style={{ fontFamily: 'monospace', color: T.textDim }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHead>By material</SectionHead>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
            {Object.entries(bd.by_material || {}).map(([m, c]) => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                <span style={{ color: T.text }}>{m}</span>
                <span style={{ fontFamily: 'monospace', color: T.textDim }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ darkMode = false, authUser, onLogout, partnerScopeOnly, adminMode }) {
  const [farm, setFarm] = useState({ printers: [], stats: {}, orders: [], feedback: [] })
  const [queue, setQueue] = useState([])
  const [inventory, setInventory] = useState([])
  const [sliceStatus, setSliceStatus] = useState(null)
  const [slicing, setSlicing] = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error, setError] = useState(null)
  const [partnerList, setPartnerList] = useState([])
  const [newPartner, setNewPartner] = useState({ name: '', email: '', password: '', role: 'partner' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  // Partner work stats: GET /api/v1/farm/partners
  // Each entry: { partner_id, active, completed, orders: [...] }
  const [partnerStats, setPartnerStats] = useState([])
  // Unassigned work queue: GET /api/v1/farm/partners/unassigned
  const [unassignedOrders, setUnassignedOrders] = useState([])
  // Selected unassigned orders for bulk-assign
  const [selectedUnassigned, setSelectedUnassigned] = useState(new Set())
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkAssignTarget, setBulkAssignTarget] = useState(null)  // partner_id or null
  const [tab, setTab] = useState('overview')
  const [alertsOpen, setAlertsOpen] = useState(false)
  // Server-side analytics payload from GET /api/v1/farm/analytics.
  // Fetched on tab open (or every 60s while the analytics tab is active).
  const [analyticsData, setAnalyticsData] = useState(null)

  // Slicer state
  const [slicerFile, setSlicerFile] = useState(null)
  const [slicerMaterial, setSlicerMaterial] = useState('PLA')
  const [slicerMachine, setSlicerMachine] = useState('BambuA1')
  const [slicerSettings, setSlicerSettings] = useState(SLICER_PRESETS.Standard)
  const [activePreset, setActivePreset] = useState('Standard')

  // API URL
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('pd_api_url') || API)
  const apiUrlRef = useRef(apiUrl)

  // Printer connectivity
  const [showAddPrinter, setShowAddPrinter] = useState(false)
  const [printerConnections, setPrinterConnections] = useState({}) // id → connection_type

  // Inventory / spool management
  const [showAddSpool, setShowAddSpool] = useState(false)
  const [editSpool, setEditSpool] = useState(null)

  // Work orders / Kanban — orders arrive via Shopify webhook / sync only,
  // operator does not create them manually.

  // Enlarged order card (production UI)
  const [enlargedOrder, setEnlargedOrder] = useState(null)
  const [enlargedFileResolve, setEnlargedFileResolve] = useState(null)
  const [enlargedAttachments, setEnlargedAttachments] = useState([])
  const [enlargedBusy, setEnlargedBusy] = useState(false)
  const [enlargedError, setEnlargedError] = useState(null)
  const fileInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const docInputRef = useRef(null)
  const [pendingFileKind, setPendingFileKind] = useState('document')

  const openEnlarged = useCallback((job) => {
    setEnlargedOrder(job)
    setEnlargedError(null)
    // Lazy-load file metadata when the modal opens
    const base = apiUrlRef.current
    fetch(`${base}/api/v1/farm/orders/${job.id || job.spec_id}/file-resolve`)
      .then(r => r.ok ? r.json() : { ok: false, error: `HTTP ${r.status}` })
      .then(setEnlargedFileResolve)
      .catch(e => setEnlargedFileResolve({ ok: false, error: e.message }))
    fetch(`${base}/api/v1/farm/orders/${job.id || job.spec_id}/attachments`)
      .then(r => r.ok ? r.json() : { ok: false, attachments: [] })
      .then(d => setEnlargedAttachments(d.attachments || []))
      .catch(() => setEnlargedAttachments([]))
  }, [])

  const closeEnlarged = () => {
    setEnlargedOrder(null)
    setEnlargedFileResolve(null)
    setEnlargedAttachments([])
    setEnlargedError(null)
  }

  const refreshEnlarged = useCallback(async () => {
    if (!enlargedOrder) return
    const base = apiUrlRef.current
    const id = enlargedOrder.id || enlargedOrder.spec_id
    // Re-pull order from /api/v1/farm/status so we have the latest status + history
    const status = await fetch(`${base}/api/v1/farm/status`).then(r => r.json())
    const fresh = (status.orders || []).find(o => o.id === id || o.spec_id === id)
    if (fresh) setEnlargedOrder(fresh)
    const atts = await fetch(`${base}/api/v1/farm/orders/${id}/attachments`).then(r => r.json())
    setEnlargedAttachments(atts.attachments || [])
  }, [enlargedOrder])

  const triggerFileUpload = (kind) => {
    setPendingFileKind(kind)
    const refs = { '3d_model': fileInputRef, photo: photoInputRef, document: docInputRef, sliced_3mf: fileInputRef }
    const ref = refs[kind] || fileInputRef
    if (ref.current) ref.current.click()
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !enlargedOrder) return
    setEnlargedBusy(true)
    setEnlargedError(null)
    try {
      const base = apiUrlRef.current
      const id = enlargedOrder.id || enlargedOrder.spec_id
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', pendingFileKind)
      fd.append('uploaded_by', 'partner_dashboard')
      fd.append('note', 'uploaded via printdash enlarged card')
      const r = await fetch(`${base}/api/v1/farm/orders/${id}/attachments`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`upload HTTP ${r.status}`)
      await refreshEnlarged()
    } catch (err) {
      setEnlargedError(err.message)
    } finally {
      setEnlargedBusy(false)
      e.target.value = ''
    }
  }

  const printAttempt = async (status, extras = {}) => {
    if (!enlargedOrder) return
    setEnlargedBusy(true)
    setEnlargedError(null)
    try {
      const base = apiUrlRef.current
      const id = enlargedOrder.id || enlargedOrder.spec_id
      const r = await fetch(`${base}/api/v1/farm/orders/${id}/print-attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, started_by: 'partner_dashboard', ...extras }),
      })
      if (!r.ok) throw new Error(`print-attempt HTTP ${r.status}`)
      await refreshEnlarged()
    } catch (err) {
      setEnlargedError(err.message)
    } finally {
      setEnlargedBusy(false)
    }
  }

  const markRedo = async () => {
    if (!enlargedOrder) return
    setEnlargedBusy(true)
    setEnlargedError(null)
    try {
      const base = apiUrlRef.current
      const id = enlargedOrder.id || enlargedOrder.spec_id
      const r = await fetch(`${base}/api/v1/farm/orders/${id}/mark-redo`, { method: 'POST' })
      if (!r.ok) throw new Error(`mark-redo HTTP ${r.status}`)
      await refreshEnlarged()
    } catch (err) {
      setEnlargedError(err.message)
    } finally {
      setEnlargedBusy(false)
    }
  }

  const reportError = async () => {
    const text = window.prompt('Describe the print error (bed adhesion, layer shift, clog, etc.):')
    if (!text) return
    await printAttempt('failed', { error_text: text })
  }

  const uploadPhotoAndFinish = async () => {
    setPendingFileKind('photo')
    if (photoInputRef.current) photoInputRef.current.click()
    // The photo input's onChange calls handleFileSelected, then we record succeeded.
    // For simplicity the user clicks "Mark Finished" after picking a file.
  }

  const markFinished = async () => {
    // Find the most recent photo attachment and link it as the success photo
    const latestPhoto = [...enlargedAttachments].reverse().find(a => a.kind === 'photo')
    await printAttempt('succeeded', latestPhoto ? { photo_attachment_id: latestPhoto.id } : {})
  }

  const updateApiUrl = (raw) => {
    const url = raw.trim().replace(/\/$/, '')
    setApiUrl(url)
    apiUrlRef.current = url
    if (url && !url.includes('localhost')) localStorage.setItem('pd_api_url', url)
    else localStorage.removeItem('pd_api_url')
  }

  const isLocalhost = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')

  const poll = useCallback(async () => {
    const base = apiUrlRef.current
    try {
      const res = await fetch(`${base}/api/v1/farm/status`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setFarm(await res.json())
      setLastPoll(new Date())
      setError(null)
    } catch (e) { setError(e.message === 'Failed to fetch' ? 'backend unreachable' : e.message) }

    try {
      const r = await fetch(`${base}/api/v1/farm/queue`)
      if (r.ok) setQueue(await r.json())
    } catch { /* endpoint may not exist yet */ }

    try {
      const r = await fetch(`${base}/api/v1/farm/inventory`)
      if (r.ok) setInventory(await r.json())
    } catch { /* endpoint may not exist yet */ }
  }, [])

  useEffect(() => {
    let alive = true
    const safePoll = async () => { if (alive) await poll() }
    safePoll()
    const t = setInterval(safePoll, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [poll])

  // Slicer helpers
  const applyPreset = (name) => {
    setActivePreset(name)
    const preset = SLICER_PRESETS[name]
    setSlicerSettings(MAT_TEMPS[slicerMaterial]
      ? { ...preset, nozzleTemp: MAT_TEMPS[slicerMaterial].nozzle, bedTemp: MAT_TEMPS[slicerMaterial].bed }
      : preset)
  }

  const setSetting = (key, value) => {
    setActivePreset(null)
    setSlicerSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleMaterialChange = (mat) => {
    setSlicerMaterial(mat)
    if (MAT_TEMPS[mat]) {
      setSlicerSettings(prev => ({ ...prev, nozzleTemp: MAT_TEMPS[mat].nozzle, bedTemp: MAT_TEMPS[mat].bed }))
      setActivePreset(null)
    }
  }

  const triggerSlice = async () => {
    setSlicing(true); setSliceStatus(null)
    const base = apiUrlRef.current
    try {
      const fd = new FormData()
      if (slicerFile) fd.append('file', slicerFile)
      fd.append('material', slicerMaterial)
      fd.append('machine', slicerMachine)
      Object.entries(slicerSettings).forEach(([k, v]) => fd.append(k, String(v)))
      const res = await fetch(`${base}/api/v1/slicer/slice`, { method: 'POST', body: fd })
      setSliceStatus(await res.json())
    } catch (e) {
      setSliceStatus({ error: e.message === 'Failed to fetch' ? 'Backend unreachable — paste your Railway URL in the API field above.' : e.message })
    }
    setSlicing(false)
  }

  // Printer actions
  const printerAction = async (id, action) => {
    await fetch(`${apiUrlRef.current}/api/v1/printers/${id}/${action}`, { method: 'POST' })
    poll()
  }

  // Partners management (admin only)
  const fetchPartners = useCallback(async () => {
    if (!adminMode) return
    try {
      const res = await fetch(`${apiUrlRef.current}/api/v1/admin/users`)
      if (!res.ok) return
      const body = await res.json()
      const users = (body.users || []).filter(u => u.role === 'partner' || u.role === 'admin')
      setPartnerList(users)
    } catch (_) {}
  }, [adminMode])

  const createPartner = async (e) => {
    e.preventDefault()
    setCreating(true); setCreateError(null)
    try {
      const body = { ...newPartner, role: newPartner.role }
      // Admin role requires the registration secret
      if (newPartner.role === 'admin') {
        // The secret is not stored on the client (would leak via DevTools).
        // Admin creation via this UI is intentionally disabled — admins
        // are created from a trusted terminal via /api/v1/auth/register.
        setCreateError('Admin creation via UI is disabled. Use /auth/register from the server terminal.')
        setCreating(false)
        return
      }
      const res = await fetch(`${apiUrlRef.current}/api/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const respBody = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(respBody.detail || `HTTP ${res.status}`)
        return
      }
      setNewPartner({ name: '', email: '', password: '', role: 'partner' })
      fetchPartners()
    } catch (err) {
      setCreateError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const deletePartner = async (email) => {
    if (!confirm(`Delete partner ${email}? This cannot be undone.`)) return
    try {
      const res = await fetch(`${apiUrlRef.current}/api/v1/admin/users/${email}`, { method: 'DELETE' })
      if (res.ok) fetchPartners()
    } catch (_) {}
  }

  // Fetch partners whenever Partners tab is active (admin only)
  useEffect(() => {
    if (tab === 'partners' && adminMode) {
      fetchPartners()
      fetchPartnerWorkStats()
      fetchUnassignedOrders()
    }
  }, [tab, adminMode, fetchPartners])

  // Fetch per-partner work stats (active/completed counts).
  const fetchPartnerWorkStats = useCallback(async () => {
    if (!adminMode) return
    try {
      const r = await fetch(`${apiUrlRef.current}/api/v1/farm/partners`)
      if (!r.ok) return
      const body = await r.json()
      setPartnerStats(body.partners || [])
    } catch (_) {}
  }, [adminMode])

  // Fetch unassigned orders (work queue).
  const fetchUnassignedOrders = useCallback(async () => {
    if (!adminMode) return
    try {
      const r = await fetch(`${apiUrlRef.current}/api/v1/farm/partners/unassigned`)
      if (!r.ok) return
      const body = await r.json()
      setUnassignedOrders(body.orders || [])
      setSelectedUnassigned(new Set())  // reset selection on refetch
    } catch (_) {}
  }, [adminMode])

  // Bulk-assign selected unassigned orders to a partner.
  const bulkAssignSelected = async (partnerId, partnerName) => {
    if (!partnerId || selectedUnassigned.size === 0) return
    setBulkAssigning(true)
    try {
      const r = await fetch(`${apiUrlRef.current}/api/v1/farm/partners/bulk-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          partner_name: partnerName,
          order_ids: Array.from(selectedUnassigned),
        }),
      })
      if (!r.ok) return
      // Refresh both lists so the queue + stats update
      await fetchUnassignedOrders()
      await fetchPartnerWorkStats()
    } catch (_) {} finally {
      setBulkAssigning(false)
      setBulkAssignTarget(null)
    }
  }

  // Unassign a single order (clear its partner assignment).
  const unassignOrder = async (orderId, reason = '') => {
    try {
      const r = await fetch(`${apiUrlRef.current}/api/v1/farm/orders/${orderId}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'unassigned from partner UI' }),
      })
      if (!r.ok) return
      // Refresh stats so the moved order shows up in the unassigned queue
      await fetchUnassignedOrders()
      await fetchPartnerWorkStats()
    } catch (_) {}
  }

  const toggleUnassignedSelection = (orderId) => {
    setSelectedUnassigned(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  // Look up partner display name from the user list (falls back to id).
  const partnerDisplayName = (partnerId) => {
    const u = partnerList.find(p => (p.id || p.email) === partnerId)
    return u?.name || partnerId
  }

  // Fetch server-side analytics whenever Analytics tab is active.
  // Also re-fetches every 60s while the tab stays open so the numbers
  // don't go stale during a long session.
  useEffect(() => {
    if (tab !== 'analytics') return
    let cancelled = false
    const fetchAnalytics = async () => {
      try {
        const r = await fetch(`${apiUrlRef.current}/api/v1/farm/analytics`)
        if (cancelled || !r.ok) return
        setAnalyticsData(await r.json())
      } catch { /* noop */ }
    }
    fetchAnalytics()
    const handle = setInterval(fetchAnalytics, 60_000)
    return () => { cancelled = true; clearInterval(handle) }
  }, [tab])

  const livePoll = async (printerId) => {
    try {
      const r = await fetch(`${apiUrlRef.current}/api/v1/printers/${printerId}/live`)
      if (r.ok) poll()
    } catch { /* noop */ }
  }

  const removePrinter = async (printerId) => {
    await fetch(`${apiUrlRef.current}/api/v1/printers/${printerId}`, { method: 'DELETE' })
    poll()
  }

  // Job / order actions
  const assignJob = async (jobId, printerId) => {
    try {
      await fetch(`${apiUrlRef.current}/api/v1/farm/queue/${jobId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_id: printerId })
      })
      poll()
    } catch { /* noop */ }
  }

  const advanceOrder = async (orderId, newStage) => {
    try {
      await fetch(`${apiUrlRef.current}/api/v1/farm/orders/${orderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStage })
      })
      poll()
    } catch { /* noop */ }
  }

  const cancelJob = async (jobId) => {
    try {
      await fetch(`${apiUrlRef.current}/api/v1/farm/orders/${jobId}`, { method: 'DELETE' })
      poll()
    } catch { /* noop */ }
  }

  // Spool actions
  const deleteSpool = async (spoolId) => {
    try {
      await fetch(`${apiUrlRef.current}/api/v1/farm/inventory/${spoolId}`, { method: 'DELETE' })
      poll()
    } catch { /* noop */ }
  }

  // Derived state
  const printers = farm.printers || []
  const stats = farm.stats || {}
  const orders = (farm.orders || []).slice().reverse()
  const feedback = (farm.feedback || []).slice().reverse()
  const printing = printers.filter(p => p.status === 'printing').length
  const idle = printers.filter(p => p.status === 'idle').length
  const errored = printers.filter(p => p.status === 'error').length
  const utilization = printers.length > 0 ? Math.round((printing / printers.length) * 100) : 0
  const successRate = feedback.length > 0
    ? Math.round((feedback.filter(f => !f.flagged_for_review).length / feedback.length) * 100) : null
  const lowSpools = inventory.filter(s => (s.remaining_pct ?? ((s.remaining_g && s.total_g) ? Math.round(s.remaining_g / s.total_g * 100) : 100)) < 20)

  // All work orders (queue + orders combined, deduplicated by id)
  const allOrders = [...queue, ...orders.filter(o => !queue.find(q => (q.id || q.spec_id) === (o.id || o.spec_id)))]
  const activeOrders = allOrders.filter(o => o.status !== 'CANCELLED' && o.status !== 'DISPATCH' && o.status !== 'LOGGED')

  const alerts = [
    ...printers.filter(p => p.status === 'error').map(p => ({
      severity: 'error', title: `${p.name} — Error`, message: p.error_message || 'Printer in error state, requires attention.', ts: null
    })),
    ...printers.filter(p => (p.hours_since_maintenance ?? 0) > 200).map(p => ({
      severity: 'warn', title: `${p.name} — Maintenance Due`, message: `${p.hours_since_maintenance}h since last maintenance.`, ts: null
    })),
    ...feedback.filter(f => f.flagged_for_review).slice(0, 3).map(f => ({
      severity: 'warn', title: `Slice Flagged — ${f.spec_id || 'job'}`, message: 'Time or weight deviation exceeds threshold.', ts: f.received_at
    })),
    ...lowSpools.map(s => ({
      severity: 'warn', title: `Low Filament — ${s.brand || ''} ${s.material}`, message: `Only ${s.remaining_pct ?? '?'}% remaining on ${s.color_name || 'spool'}.`, ts: null
    })),
  ]

  // Partner printdash hides the Slicer tab — partners do slicing via
  // OrcaSlicer / BambuStudio on their own workstations and upload the
  // resulting G-code through the order card's attachment flow. The
  // Tabs shown in the dashboard navigation. As of 2026-06-25 we ship
  // 3 tabs: Overview (KPI summary + recent activity), Kanban (drag-drop
  // board by stage), and Analytics (server-side farm-wide metrics:
  // sales, waste, quality, speed, assigned time, delivery time).
  // Other tabs (Partners, Printers, Inventory, Slicer) were removed
  // from the navigation but their backend endpoints remain reachable
  // so the features can be re-added later by extending this array.
  const ALL_TABS = [
    { id: 'overview',  label: 'Overview',  icon: '◉' },
    { id: 'kanban',    label: 'Kanban',    icon: '▦', badge: activeOrders.length || null },
    { id: 'partners',  label: 'Partners',  icon: '◇', badge: adminMode && partnerList ? partnerList.length || null : null },
    { id: 'analytics', label: 'Analytics', icon: '◎' },
  ]
  const TABS = partnerScopeOnly
    ? ALL_TABS.filter(t => t.id !== 'partners')
    : ALL_TABS
  // All shipped tabs are visible to all roles; safeTab is now a pass-through.
  const safeTab = tab

  const T = darkMode
    ? { bg: '#080808', card: 'rgba(255,255,255,0.02)', cardHover: 'rgba(255,255,255,0.04)',
        border: 'rgba(255,255,255,0.06)', text: '#e0e0e0', textDim: '#999', textFaint: '#555',
        inputBg: '#0d0d0d', inputBorder: 'rgba(255,255,255,0.07)', sectionBg: 'rgba(255,255,255,0.01)' }
    : { bg: '#f5f5f7', card: '#ffffff', cardHover: 'rgba(0,0,0,0.03)',
        border: 'rgba(0,0,0,0.08)', text: '#111111', textDim: '#555', textFaint: '#999',
        inputBg: '#f0f0f2', inputBorder: 'rgba(0,0,0,0.1)', sectionBg: 'rgba(0,0,0,0.02)' }

  const selectStyle = {
    width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`,
    color: T.textDim, padding: '5px 8px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer'
  }
  const numStyle = {
    width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`,
    color: T.textDim, padding: '5px 8px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', textAlign: 'right'
  }

  const matBreakdown = {}
  ;[...orders, ...feedback].forEach(item => {
    if (item.material) matBreakdown[item.material] = (matBreakdown[item.material] || 0) + 1
  })
  const maxMatCount = Math.max(1, ...Object.values(matBreakdown))

  // Kanban: group allOrders by stage
  const kanbanByStage = {}
  ORDER_STAGES.forEach(s => { kanbanByStage[s] = [] })
  allOrders.filter(o => o.status !== 'CANCELLED').forEach(o => {
    const s = o.status
    if (kanbanByStage[s]) kanbanByStage[s].push(o)
  })

  return (
      <ThemeCtx.Provider value={T}>
      <div style={{ minHeight: '100vh', padding: '20px 24px', fontFamily: "'Inter', system-ui, sans-serif", color: T.text, background: T.bg }}>
        {authUser && (
          <div style={{
            position: 'fixed', top: 60, right: 12, zIndex: 50,
            background: 'rgba(15,15,20,0.85)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '5px 8px', fontSize: 10, color: T.textDim,
            display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(8px)',
            maxWidth: 240, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            <span style={{
              padding: '1px 5px', borderRadius: 3, fontWeight: 700, fontSize: 8,
              letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
              background: authUser.role === 'admin' ? '#4a9eff20' : '#00cc6620',
              color: authUser.role === 'admin' ? '#4a9eff' : '#00cc66',
              border: `1px solid ${authUser.role === 'admin' ? '#4a9eff50' : '#00cc6650'}`,
            }}>{authUser.role}</span>
            <span style={{
              color: T.text, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1, minWidth: 0, fontSize: 10,
            }}>{authUser.email || authUser.partner_id}</span>
            {onLogout && (
              <button onClick={onLogout} title="Logout" style={{
                background: 'transparent', border: 'none',
                color: T.textDim, padding: '0 4px', cursor: 'pointer',
                fontSize: 11, flexShrink: 0, lineHeight: 1,
              }}>⏻</button>
            )}
          </div>
        )}
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(1.5)} }
          * { box-sizing: border-box }
          ::-webkit-scrollbar { width: 3px; height: 3px } ::-webkit-scrollbar-track { background: transparent }
          ::-webkit-scrollbar-thumb { background: ${T.border}; borderRadius: 2px }
        `}</style>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div onClick={() => setAlertsOpen(v => !v)} style={{
          background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.15)',
          borderRadius: 7, padding: '8px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#ff9800', fontSize: 11 }}>⚠</span>
            <span style={{ fontSize: 10, color: T.textDim }}>{alerts.length} issue{alerts.length > 1 ? 's' : ''} need attention</span>
            <span style={{ fontSize: 9, color: T.textFaint }}>— click to {alertsOpen ? 'hide' : 'view'}</span>
          </div>
          <span style={{ fontSize: 9, color: T.textFaint }}>{alertsOpen ? '▲' : '▼'}</span>
        </div>
      )}
      {alertsOpen && alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>{alerts.map((a, i) => <AlertCard key={i} alert={a} />)}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#00cc66' }}>printdash</span>
            <span style={{ fontSize: 10, color: T.textFaint }}>by fofus.in</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PulsingDot color={error ? '#ff4444' : '#00cc66'} />
            <span style={{ fontSize: 9, color: error ? '#ff4444' : T.textDim }}>
              {error ? `offline — ${error}` : lastPoll ? `live · ${lastPoll.toLocaleTimeString()}` : 'connecting...'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '5px 11px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 5,
              background: tab === t.id ? '#00cc6612' : 'transparent',
              color: tab === t.id ? '#00cc66' : T.textFaint,
              border: tab === t.id ? '1px solid #00cc6628' : '1px solid transparent',
              transition: 'all 0.15s', position: 'relative'
            }}>
              {t.icon} {t.label}
              {t.badge ? (
                <span style={{
                  position: 'absolute', top: -5, right: -5, background: '#ff4444',
                  color: '#fff', fontSize: 8, borderRadius: '50%', width: 14, height: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                }}>{t.badge}</span>
              ) : null}
            </button>
          ))}
          <button onClick={poll} style={{
            padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 5,
            background: 'transparent', border: `1px solid ${T.border}`, color: T.textDim
          }}>↻</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard icon="📦" label="Active Orders" value={activeOrders.length || (stats.active_orders ?? '—')} color="#00cc66" sub={`${allOrders.length} total`} />
        <StatCard icon="⬡" label="Printing" value={printing} color="#4a9eff" sub={`${idle} idle · ${printers.length} total`} />
        <StatCard icon="◎" label="Utilization" value={printers.length > 0 ? `${utilization}%` : '—'} color={utilization > 70 ? '#00cc66' : utilization > 40 ? '#ff9800' : '#555'} sub="fleet capacity" />
        <StatCard icon="⚠" label="Flagged" value={alerts.length > 0 ? alerts.length : (stats.flagged ?? 0)} color="#ff9800" sub="needs review" alert={alerts.length > 0} />
        <StatCard icon="✓" label="Success Rate" value={successRate != null ? `${successRate}%` : '—'} color={successRate > 90 ? '#00cc66' : '#ff9800'} sub={`${feedback.length} slices`} />
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {safeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <SectionHead>Printer Farm</SectionHead>
            {printers.length === 0
              ? <EmptyState icon="⬡" title="No printers registered" hint="Go to Printers tab → Connect New Printer\nto add a Bambu, Klipper, or OctoPrint printer" />
              : printers.map(p => <PrinterCard key={p.id} printer={p} onAction={printerAction} onLivePoll={livePoll} connType={p.connection_type} />)
            }
          </div>
          <div>
            <SectionHead>Recent Activity</SectionHead>
            {feedback.length === 0 && orders.length === 0
              ? <EmptyState icon="◈" title="No activity yet" hint="Use the Slicer tab to slice a file\nor add work orders in Kanban" />
              : <>
                {feedback.slice(0, 3).map((e, i) => <SliceCard key={i} entry={e} />)}
                {orders.slice(0, 4).map((o, i) => <OrderRow key={i} order={o} />)}
              </>
            }
          </div>
        </div>
      )}

      {/* ── KANBAN ───────────────────────────────────────────────────────────── */}
      {safeTab === 'kanban' && (
        <div>
          <SectionHead>
            Kanban Board — {activeOrders.length} active
          </SectionHead>

          {/* Kanban columns */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12 }}>
            {ORDER_STAGES.map(stage => (
              <KanbanColumn
                key={stage}
                stage={stage}
                jobs={kanbanByStage[stage] || []}
                onMove={advanceOrder}
                onCancel={cancelJob}
                onDrop={advanceOrder}
                onOpen={openEnlarged}
              />
            ))}
          </div>

          <div style={{ marginTop: 8, fontSize: 8, color: T.textFaint }}>
            Drag cards between columns to advance stages · Click → or ← buttons on each card
          </div>
        </div>
      )}

      {/* ── PARTNERS ─────────────────────────────────────────────────────────── */}
      {safeTab === 'partners' && adminMode && (
        <div style={{ maxWidth: 720 }}>
          <SectionHead>Partners & Admins — {partnerList.length} user{partnerList.length !== 1 ? 's' : ''}</SectionHead>

          {partnerList.length === 0
            ? <EmptyState icon="◇" title="No partners yet" hint="Create one with the form below." />
            : <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                {partnerList.map(u => (
                  <div key={u.email} style={{
                    background: T.card, border: `1px solid ${T.border}`,
                    borderRadius: 7, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    minWidth: 0,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: u.role === 'admin' ? '#4a9eff' : '#00cc66',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                    }}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: T.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{u.name}</div>
                      <div style={{
                        fontSize: 10, color: T.textDim,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{u.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <Tag color={u.role === 'admin' ? '#4a9eff' : '#00cc66'}>{u.role}</Tag>
                      <Tag color="#888">{u.provider}</Tag>
                    </div>
                    {u.email !== authUser?.email && (
                      <button onClick={() => deletePartner(u.email)} style={{
                        background: 'transparent', border: '1px solid #ff4444',
                        color: '#ff4444', padding: '4px 10px', borderRadius: 4,
                        fontSize: 10, cursor: 'pointer', flexShrink: 0,
                      }}>Delete</button>
                    )}
                  </div>
                ))}
              </div>}

          {/* ── WORK STATS — per-partner active/completed counts ───────────── */}
          {partnerStats.length > 0 && (
            <>
              <SectionHead>Work Queue — per partner</SectionHead>
              <div style={{ display: 'grid', gap: 6, marginBottom: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {partnerStats.map(p => {
                  const displayName = partnerDisplayName(p.partner_id)
                  const isTarget = bulkAssignTarget === p.partner_id
                  return (
                    <div key={p.partner_id} style={{
                      background: T.card, border: `1px solid ${isTarget ? '#00cc66' : T.border}`,
                      borderRadius: 6, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: T.text,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{displayName}</div>
                        <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>
                          <span style={{ color: '#ff9800' }}>{p.active} active</span>
                          {' · '}
                          <span style={{ color: '#00cc66' }}>{p.completed} done</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setBulkAssignTarget(isTarget ? null : p.partner_id)}
                        title={isTarget ? 'Cancel selection' : `Select ${displayName} as bulk-assign target`}
                        style={{
                          fontSize: 9, padding: '3px 8px', borderRadius: 3,
                          background: isTarget ? '#00cc6620' : 'transparent',
                          border: `1px solid ${isTarget ? '#00cc66' : T.border}`,
                          color: isTarget ? '#00cc66' : T.textDim,
                          cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        {isTarget ? '✓ Target' : 'Set target'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── UNASSIGNED ORDERS — work queue with bulk-assign ────────────── */}
          <SectionHead action={
            <span style={{ fontSize: 9, color: T.textFaint }}>
              {unassignedOrders.length} unassigned · {selectedUnassigned.size} selected
            </span>
          }>
            Unassigned Orders
          </SectionHead>
          {unassignedOrders.length === 0
            ? <EmptyState icon="◇" title="No unassigned orders" hint="All open orders are assigned to a partner." />
            : (
              <>
                {selectedUnassigned.size > 0 && (
                  <div style={{
                    marginBottom: 10, padding: '8px 12px', background: '#00cc6610',
                    border: '1px solid #00cc6640', borderRadius: 6,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 11, color: T.text, flex: 1 }}>
                      Bulk-assign <strong>{selectedUnassigned.size}</strong> order{selectedUnassigned.size !== 1 ? 's' : ''} to:
                    </span>
                    <select
                      value={bulkAssignTarget || ''}
                      onChange={e => setBulkAssignTarget(e.target.value || null)}
                      style={{
                        fontSize: 10, padding: '4px 8px', borderRadius: 4,
                        background: T.inputBg, border: `1px solid ${T.border}`,
                        color: T.text, cursor: 'pointer',
                      }}
                    >
                      <option value="">— pick a partner —</option>
                      {partnerStats.map(p => (
                        <option key={p.partner_id} value={p.partner_id}>
                          {partnerDisplayName(p.partner_id)} ({p.active} active)
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const target = partnerStats.find(p => p.partner_id === bulkAssignTarget)
                        if (target) bulkAssignSelected(target.partner_id, partnerDisplayName(target.partner_id))
                      }}
                      disabled={!bulkAssignTarget || bulkAssigning}
                      style={{
                        fontSize: 10, padding: '5px 12px', fontWeight: 700, letterSpacing: '0.04em',
                        background: bulkAssignTarget && !bulkAssigning ? '#00cc66' : T.inputBg,
                        border: `1px solid ${bulkAssignTarget ? '#00cc66' : T.border}`,
                        color: bulkAssignTarget ? '#000' : T.textFaint,
                        cursor: bulkAssignTarget && !bulkAssigning ? 'pointer' : 'not-allowed',
                        borderRadius: 4,
                      }}
                    >
                      {bulkAssigning ? 'Assigning…' : '✓ Assign'}
                    </button>
                    <button
                      onClick={() => setSelectedUnassigned(new Set())}
                      style={{
                        fontSize: 10, padding: '5px 10px', background: 'transparent',
                        border: `1px solid ${T.border}`, color: T.textDim,
                        cursor: 'pointer', borderRadius: 4,
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
                  {unassignedOrders.map(o => {
                    const checked = selectedUnassigned.has(o.id)
                    return (
                      <div key={o.id} style={{
                        background: T.card, border: `1px solid ${checked ? '#00cc66' : T.border}`,
                        borderRadius: 6, padding: '8px 12px',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUnassignedSelection(o.id)}
                          style={{ cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: T.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {o.shopify_order?.name || o.name || o.id}
                            {o.customer_name ? <span style={{ color: T.textDim, fontWeight: 400 }}> · {o.customer_name}</span> : null}
                          </div>
                          <div style={{ fontSize: 9, color: T.textDim, marginTop: 2, display: 'flex', gap: 8 }}>
                            <Tag color="#4a9eff">{o.status}</Tag>
                            {o.material ? <Tag color="#888">{o.material}</Tag> : null}
                            {o.est_time_min ? <span>~{Math.round(o.est_time_min)} min</span> : null}
                            {o.est_cost ? <span>₹{Math.round(o.est_cost)}</span> : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

          <SectionHead>Create Partner</SectionHead>
          <form onSubmit={createPartner} style={{
            display: 'grid', gap: 10,
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 16, marginTop: 6,
          }}>
            <input
              required value={newPartner.name}
              onChange={e => setNewPartner({...newPartner, name: e.target.value})}
              placeholder="Display name"
              style={inputStyle(T)}
            />
            <input
              required type="email" value={newPartner.email}
              onChange={e => setNewPartner({...newPartner, email: e.target.value})}
              placeholder="Email"
              style={inputStyle(T)}
            />
            <input
              required type="password" value={newPartner.password}
              onChange={e => setNewPartner({...newPartner, password: e.target.value})}
              placeholder="Password (min 8 chars)"
              minLength={8}
              style={inputStyle(T)}
            />
            <select
              value={newPartner.role}
              onChange={e => setNewPartner({...newPartner, role: e.target.value})}
              style={inputStyle(T)}
            >
              <option value="partner">Partner</option>
              <option value="admin">Admin (requires secret)</option>
            </select>
            <button type="submit" disabled={creating} style={{
              background: '#00cc66', color: '#000', border: 'none',
              padding: '8px 14px', borderRadius: 5, fontWeight: 700,
              fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.6 : 1,
            }}>{creating ? 'Creating...' : 'Create'}</button>
            {createError && <div style={{ color: '#ff4444', fontSize: 11 }}>{createError}</div>}
          </form>
        </div>
      )}

      {/* ── PRINTERS ─────────────────────────────────────────────────────────── */}
      {safeTab === 'printers' && (
        <div style={{ maxWidth: 720 }}>
          <SectionHead
            action={
              <button onClick={() => setShowAddPrinter(v => !v)} style={{
                fontSize: 9, padding: '4px 12px', background: showAddPrinter ? 'transparent' : '#00cc6612',
                border: `1px solid ${showAddPrinter ? T.border : '#00cc6630'}`,
                color: showAddPrinter ? T.textDim : '#00cc66', cursor: 'pointer', borderRadius: 5, fontWeight: 600
              }}>{showAddPrinter ? '✕ Cancel' : '+ Connect Printer'}</button>
            }
          >
            {printers.length} Printers
          </SectionHead>

          {showAddPrinter && (
            <ConnectPrinterForm
              base={apiUrlRef.current}
              onSave={() => { setShowAddPrinter(false); poll() }}
              onCancel={() => setShowAddPrinter(false)}
            />
          )}

          {/* Connection type guide */}
          {!showAddPrinter && printers.length === 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { icon: '◉', name: 'Bambu LAN', desc: 'X1C, P1S, A1 — Enable LAN Mode on printer. Find Access Code in Settings → WLAN.', color: '#00cc66' },
                  { icon: '⬡', name: 'Moonraker', desc: 'Voron, Ender3 with Klipper — Enter your Mainsail or Fluidd URL.', color: '#4a9eff' },
                  { icon: '○', name: 'OctoPrint', desc: 'Any FDM printer via OctoPrint — Enter host URL and API key.', color: '#ff9800' },
                ].map(c => (
                  <div key={c.name} style={{ background: `${c.color}08`, border: `1px solid ${c.color}18`, borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, color: c.color, fontWeight: 700, marginBottom: 4 }}>{c.icon} {c.name}</div>
                    <div style={{ fontSize: 9, color: T.textDim, lineHeight: 1.6 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
              <EmptyState icon="⬡" title="No printers connected" hint="Click '+ Connect Printer' above to add your first printer" />
            </div>
          )}

          {printers.map(p => (
            <div key={p.id}>
              <PrinterCard printer={p} onAction={printerAction} onLivePoll={livePoll} connType={p.connection_type} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: 10 }}>
                <button onClick={() => removePrinter(p.id)} style={{
                  fontSize: 8, padding: '2px 10px', background: 'transparent',
                  border: `1px solid ${T.border}`, color: '#ff444444', cursor: 'pointer', borderRadius: 3
                }}>Remove printer</button>
              </div>
            </div>
          ))}

          {printers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <SectionHead>Fleet Health</SectionHead>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
                {[
                  ['Printing', printing, printers.length, '#00cc66'],
                  ['Idle', idle, printers.length, '#4a9eff'],
                  ['Error / Offline', errored, printers.length, '#ff4444'],
                ].map(([label, val, total, color]) => (
                  <MiniBar key={label} label={label} value={val} max={total} color={color} unit={` / ${total}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ANALYTICS ────────────────────────────────────────────────────────── */}
      {safeTab === 'analytics' && (
        analyticsData == null
          ? <div style={{ padding: 20, color: T.textDim, fontSize: 11 }}>Loading farm analytics…</div>
          : <AnalyticsPanel data={analyticsData} T={T} />
      )}

      {/* ── INVENTORY ────────────────────────────────────────────────────────── */}
      {safeTab === 'inventory' && (
        <div>
          <SectionHead
            action={
              <button onClick={() => { setShowAddSpool(v => !v); setEditSpool(null) }} style={{
                fontSize: 9, padding: '4px 12px', background: showAddSpool ? 'transparent' : '#00cc6612',
                border: `1px solid ${showAddSpool ? T.border : '#00cc6630'}`,
                color: showAddSpool ? T.textDim : '#00cc66', cursor: 'pointer', borderRadius: 5, fontWeight: 600
              }}>{showAddSpool ? '✕ Cancel' : '+ Add Spool'}</button>
            }
          >
            Filament Inventory — {inventory.length} spool{inventory.length !== 1 ? 's' : ''}
          </SectionHead>

          {(showAddSpool || editSpool) && (
            <AddSpoolForm
              base={apiUrlRef.current}
              printers={printers}
              initialData={editSpool}
              onSave={() => { setShowAddSpool(false); setEditSpool(null); poll() }}
              onCancel={() => { setShowAddSpool(false); setEditSpool(null) }}
            />
          )}

          {inventory.length === 0 && !showAddSpool ? (
            <EmptyState icon="⬜" title="No filament tracked"
              hint="Click '+ Add Spool' to track filament stock, assign spools to printers, and get low-stock alerts"
            />
          ) : (
            <>
              {lowSpools.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHead>⚠ Low Stock</SectionHead>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                    {lowSpools.map((s, i) => <SpoolCard key={i} spool={s} onDelete={deleteSpool} onEdit={s => { setEditSpool(s); setShowAddSpool(false) }} />)}
                  </div>
                </div>
              )}
              <SectionHead>All Spools</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
                {inventory.map((s, i) => <SpoolCard key={i} spool={s} onDelete={deleteSpool} onEdit={s => { setEditSpool(s); setShowAddSpool(false) }} />)}
              </div>

              {/* Inventory summary */}
              <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Total Filament</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: T.text }}>
                    {inventory.reduce((s, sp) => s + (sp.remaining_g || 0), 0).toFixed(0)}g
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Estimated Value</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#00cc66' }}>
                    ${inventory.reduce((s, sp) => s + (sp.remaining_g || 0) * (sp.cost_per_g || 0.025), 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Low Stock</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: lowSpools.length > 0 ? '#ff4444' : T.text }}>
                    {lowSpools.length} spool{lowSpools.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SLICER ─────────────────────────────────────────────────────────────── */}
      {safeTab === 'slicer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>

          <div>
                      {isLocalhost && <SectionHead>Backend Connection</SectionHead>}
                      {isLocalhost && (
              <div style={{
                background: 'rgba(255,152,0,0.06)',
                border: '1px solid rgba(255,152,0,0.2)',
                borderRadius: 8, padding: '10px 12px', marginBottom: 14
              }}>
                <div style={{ fontSize: 9, color: '#ff9800', marginBottom: 6, fontWeight: 600 }}>
                  ⚠ Not connected — set your Railway URL
                </div>
                <input value={apiUrl} onChange={e => updateApiUrl(e.target.value)} placeholder="https://your-app.railway.app"
                  style={{ width: '100%', background: T.inputBg, border: '1px solid rgba(255,152,0,0.2)', color: T.text, padding: '6px 10px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace' }} />
                <div style={{ fontSize: 8, color: T.textDim, marginTop: 5, lineHeight: 1.6 }}>
                  Railway → backend service → Settings → Networking → Public URL
                </div>
              </div>
            )}

            <SectionHead>File</SectionHead>
            <DropZone file={slicerFile} onFile={setSlicerFile} />
            {slicerFile && (
              <button onClick={() => setSlicerFile(null)} style={{
                fontSize: 9, padding: '3px 10px', background: 'transparent', border: `1px solid ${T.border}`,
                color: T.textDim, cursor: 'pointer', borderRadius: 4, marginBottom: 14, display: 'block'
              }}>✕ clear file</button>
            )}

            <SectionHead>Quick Preset</SectionHead>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {Object.keys(SLICER_PRESETS).map(name => (
                <button key={name} onClick={() => applyPreset(name)} style={{
                  flex: 1, padding: '6px 4px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 5,
                  background: activePreset === name ? '#00cc6615' : 'transparent',
                  color: activePreset === name ? '#00cc66' : T.textDim,
                  border: activePreset === name ? '1px solid #00cc6630' : `1px solid ${T.border}`,
                  transition: 'all 0.15s'
                }}>{name}</button>
              ))}
            </div>

            <SectionHead>Print Setup</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 6px' }}>
              <SlicerParam label="Machine">
                <select value={slicerMachine} onChange={e => setSlicerMachine(e.target.value)} style={selectStyle}>
                  {MACHINES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </SlicerParam>
              <SlicerParam label="Material">
                <select value={slicerMaterial} onChange={e => handleMaterialChange(e.target.value)} style={selectStyle}>
                  {SLICER_MATS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </SlicerParam>
              <SlicerParam label="Layer Height">
                <select value={slicerSettings.layerHeight} onChange={e => setSetting('layerHeight', e.target.value)} style={selectStyle}>
                  {LAYER_HEIGHTS.map(h => <option key={h} value={h}>{h} mm</option>)}
                </select>
              </SlicerParam>
            </div>

            {sliceStatus && (
              <div style={{ marginTop: 16 }}>
                <SectionHead>Last Result</SectionHead>
                {sliceStatus.error
                  ? <div style={{ color: '#ff4444', fontSize: 11, padding: 10 }}>{sliceStatus.error}</div>
                  : <SliceCard entry={{ ...sliceStatus, spec_id: slicerFile?.name || 'direct-slice', material: slicerMaterial, machine_class: slicerMachine, received_at: new Date().toISOString() }} />
                }
              </div>
            )}
            {feedback.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <SectionHead>History ({feedback.length})</SectionHead>
                {feedback.slice(0, 6).map((e, i) => <SliceCard key={i} entry={e} />)}
              </div>
            )}
          </div>

          <div>
            <SectionHead>Infill</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
              <SlicerParam label="Density">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={0} max={100} step={5} value={slicerSettings.infillDensity}
                    onChange={e => setSetting('infillDensity', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#00cc66' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#00cc66', width: 36, textAlign: 'right' }}>
                    {slicerSettings.infillDensity}%
                  </span>
                </div>
              </SlicerParam>
              <SlicerParam label="Pattern">
                <select value={slicerSettings.infillPattern} onChange={e => setSetting('infillPattern', e.target.value)} style={selectStyle}>
                  {INFILL_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </SlicerParam>
            </div>

            <SectionHead>Walls &amp; Layers</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
              <SlicerParam label="Perimeters">
                <input type="number" min={1} max={10} value={slicerSettings.walls}
                  onChange={e => setSetting('walls', Number(e.target.value))} style={numStyle} />
              </SlicerParam>
              <SlicerParam label="Top Layers">
                <input type="number" min={1} max={10} value={slicerSettings.topLayers}
                  onChange={e => setSetting('topLayers', Number(e.target.value))} style={numStyle} />
              </SlicerParam>
              <SlicerParam label="Bottom Layers">
                <input type="number" min={1} max={10} value={slicerSettings.bottomLayers}
                  onChange={e => setSetting('bottomLayers', Number(e.target.value))} style={numStyle} />
              </SlicerParam>
            </div>

            <SectionHead>Support</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 10px', marginBottom: 14 }}>
              <SlicerParam label="Type">
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['none', 'None'], ['normal', 'Normal'], ['tree', 'Tree (Organic)']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setSetting('supportType', val)} style={{
                      flex: 1, padding: '5px 4px', fontSize: 9, cursor: 'pointer', borderRadius: 4,
                      background: slicerSettings.supportType === val ? '#4a9eff18' : 'transparent',
                      color: slicerSettings.supportType === val ? '#4a9eff' : T.textDim,
                      border: slicerSettings.supportType === val ? '1px solid #4a9eff30' : `1px solid ${T.border}`,
                      fontWeight: slicerSettings.supportType === val ? 700 : 400
                    }}>{lbl}</button>
                  ))}
                </div>
              </SlicerParam>
              {slicerSettings.supportType !== 'none' && (
                <SlicerParam label="Threshold">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min={15} max={80} step={5} value={slicerSettings.supportThreshold}
                      onChange={e => setSetting('supportThreshold', Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#4a9eff' }} />
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4a9eff', width: 36, textAlign: 'right' }}>
                      {slicerSettings.supportThreshold}°
                    </span>
                  </div>
                </SlicerParam>
              )}
            </div>

            <SectionHead>Speed</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
              <SlicerParam label="Print Speed">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={20} max={500} step={10} value={slicerSettings.printSpeed}
                    onChange={e => setSetting('printSpeed', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#ff9800' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff9800', width: 52, textAlign: 'right' }}>
                    {slicerSettings.printSpeed} mm/s
                  </span>
                </div>
              </SlicerParam>
              <SlicerParam label="Travel Speed">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={50} max={600} step={10} value={slicerSettings.travelSpeed}
                    onChange={e => setSetting('travelSpeed', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#ff9800' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff9800', width: 52, textAlign: 'right' }}>
                    {slicerSettings.travelSpeed} mm/s
                  </span>
                </div>
              </SlicerParam>
            </div>

            <SectionHead>Temperature</SectionHead>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 14px 6px', marginBottom: 18 }}>
              <SlicerParam label="Nozzle">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={150} max={320} step={5} value={slicerSettings.nozzleTemp}
                    onChange={e => setSetting('nozzleTemp', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#ff4444' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff9800', width: 40, textAlign: 'right' }}>
                    {slicerSettings.nozzleTemp}°C
                  </span>
                </div>
              </SlicerParam>
              <SlicerParam label="Bed">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={0} max={130} step={5} value={slicerSettings.bedTemp}
                    onChange={e => setSetting('bedTemp', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#ff6644' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff9800', width: 40, textAlign: 'right' }}>
                    {slicerSettings.bedTemp}°C
                  </span>
                </div>
              </SlicerParam>
            </div>

            <button onClick={triggerSlice} disabled={slicing} style={{
              width: '100%', padding: 13, borderRadius: 7,
              background: slicing ? T.inputBg : '#00cc66',
              color: slicing ? T.textDim : '#000',
              border: slicing ? `1px solid ${T.border}` : 'none',
              fontWeight: 800, fontSize: 12, cursor: slicing ? 'default' : 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.2s'
            }}>
              {slicing ? '⏳ Slicing...' : `◈ Slice Now${slicerFile ? ` — ${slicerFile.name.slice(0, 20)}` : ''}`}
            </button>
            <div style={{ fontSize: 8, color: T.textFaint, marginTop: 6, textAlign: 'center' }}>
              {slicerMachine} · {slicerMaterial} · {slicerSettings.layerHeight}mm · {slicerSettings.infillDensity}% {slicerSettings.infillPattern}
              {slicerSettings.supportType !== 'none' ? ` · ${slicerSettings.supportType} supports` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Enlarged card modal (production UI for partners) */}
      <EnlargedCardModal
        order={enlargedOrder}
        fileResolve={enlargedFileResolve}
        attachments={enlargedAttachments}
        busy={enlargedBusy}
        error={enlargedError}
        onClose={closeEnlarged}
        onUpload3D={() => triggerFileUpload('3d_model')}
        onUploadPhoto={uploadPhotoAndFinish}
        onUploadDoc={() => triggerFileUpload('document')}
        onFileSelected={handleFileSelected}
        fileInputRef={fileInputRef}
        photoInputRef={photoInputRef}
        docInputRef={docInputRef}
        onMake={() => printAttempt('started')}
        onMarkFinished={markFinished}
        onReportError={reportError}
        onMarkRedo={markRedo}
        apiUrl={apiUrl}
        authUser={authUser}
      />
    </div>
  </ThemeCtx.Provider>
  )
}
