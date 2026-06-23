import { useState, useEffect, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STATUS_COLOR = {
  printing: '#00ff88', idle: '#4a9eff', paused: '#ff9800',
  error: '#ff4444', offline: '#333', slicing: '#aa44ff', warming: '#ff9800'
}

const ORDER_STAGES = ['NEW', 'AI_PREP', 'PRINTING', 'POST_PROCESS', 'QC', 'PACK', 'DISPATCH']
const ORDER_COLOR = {
  NEW: '#555', AI_PREP: '#4a9eff', PRINTING: '#00ff88',
  POST_PROCESS: '#ff9800', QC: '#aa44ff', PACK: '#ff9800', DISPATCH: '#00ff88'
}
const ORDER_ICON = {
  NEW: '○', AI_PREP: '◎', PRINTING: '⬡', POST_PROCESS: '⚙',
  QC: '◈', PACK: '□', DISPATCH: '✓'
}

const MAT_COLOR = { PLA: '#00ff88', PETG: '#4a9eff', ABS: '#ff9800', TPU: '#aa44ff', ASA: '#ff6644', NYLON: '#ffcc00', 'PLA-CF': '#88ff44', 'PA-CF': '#ff88aa' }

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

function SectionHead({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{children}</div>
      {action}
    </div>
  )
}

function EmptyState({ icon = '○', title, hint }) {
  return (
    <div style={{
      border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 8,
      padding: '32px 16px', textAlign: 'center'
    }}>
      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 11, color: '#333', marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 9, color: '#222', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{hint}</div>}
    </div>
  )
}

function PulsingDot({ color, size = 8 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: color === '#00ff88' ? 'pulse 2s infinite' : 'none'
      }} />
    </span>
  )
}

function Pill({ value, label, color = '#888' }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#2a2a2a', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', color, fontWeight: 600 }}>{value ?? '—'}</div>
    </div>
  )
}

function ProgressBar({ pct, color = '#00ff88', height = 3 }) {
  return (
    <div style={{ height, background: '#111', borderRadius: height }}>
      <div style={{ width: `${Math.min(100, pct || 0)}%`, height: '100%', background: color, borderRadius: height, transition: 'width 0.5s' }} />
    </div>
  )
}

function StatCard({ label, value, sub, color = '#fff', icon, alert }) {
  return (
    <div style={{
      background: alert ? 'rgba(255,68,68,0.04)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${alert ? '#ff444422' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: '14px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 18, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

// ─── Printer Card ──────────────────────────────────────────────────────────────

function PrinterCard({ printer, onAction, onLivePoll, connType }) {
  const color = STATUS_COLOR[printer.status] || '#555'
  const pct = printer.progress_pct ?? 0
  const maintenanceHours = printer.hours_since_maintenance
  const maintColor = maintenanceHours == null ? '#333'
    : maintenanceHours > 200 ? '#ff4444' : maintenanceHours > 100 ? '#ff9800' : '#00ff88'
  const [polling, setPolling] = useState(false)

  const doLivePoll = async () => {
    setPolling(true)
    await onLivePoll(printer.id)
    setPolling(false)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)', border: `1px solid ${color}1a`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulsingDot color={color} />
          <span style={{ fontSize: 12, color: '#ddd', fontWeight: 600 }}>{printer.name}</span>
          {printer.model && <span style={{ fontSize: 9, color: '#333' }}>{printer.model}</span>}
          {connType && connType !== 'manual' && (
            <Tag color="#4a9eff">{connType}</Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <Tag color={color}>{printer.status}</Tag>
          {connType && connType !== 'manual' && (
            <button onClick={doLivePoll} disabled={polling} style={{
              fontSize: 9, padding: '2px 8px', background: '#4a9eff12', border: '1px solid #4a9eff30',
              color: polling ? '#333' : '#4a9eff', cursor: polling ? 'default' : 'pointer', borderRadius: 3
            }}>{polling ? '...' : '↻ Live'}</button>
          )}
          {printer.status === 'printing' && (
            <button onClick={() => onAction(printer.id, 'pause')} style={{
              fontSize: 9, padding: '2px 8px', background: 'transparent',
              border: '1px solid #222', color: '#555', cursor: 'pointer', borderRadius: 3
            }}>⏸</button>
          )}
          {printer.status === 'paused' && (
            <button onClick={() => onAction(printer.id, 'resume')} style={{
              fontSize: 9, padding: '2px 8px', background: '#00ff8812',
              border: '1px solid #00ff8830', color: '#00ff88', cursor: 'pointer', borderRadius: 3
            }}>▶</button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 10, padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
        <Pill label="Nozzle" value={printer.nozzle_temp != null ? `${printer.nozzle_temp}°` : '—'} color={printer.nozzle_temp > 150 ? '#ff9800' : '#555'} />
        <Pill label="Bed" value={printer.bed_temp != null ? `${printer.bed_temp}°` : '—'} color={printer.bed_temp > 40 ? '#ff9800' : '#555'} />
        <Pill label="Progress" value={printer.status === 'printing' ? `${pct}%` : '—'} color="#00ff88" />
        <Pill label="Maint" value={maintenanceHours != null ? `${maintenanceHours}h` : '—'} color={maintColor} />
      </div>
      {printer.current_job && (
        <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', marginBottom: 8 }}>
          ⬡ {printer.current_job}
          {printer.layer_num && printer.total_layers && (
            <span style={{ color: '#2a2a2a', marginLeft: 8 }}>Layer {printer.layer_num}/{printer.total_layers}</span>
          )}
        </div>
      )}
      {printer.status === 'printing' && <ProgressBar pct={pct} color={color} />}
      {printer.eta_minutes != null && printer.status === 'printing' && (
        <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 4, textAlign: 'right' }}>
          ETA {printer.eta_minutes}min
        </div>
      )}
    </div>
  )
}

// ─── Connect Printer Form ─────────────────────────────────────────────────────

function ConnectPrinterForm({ onSave, onCancel, base }) {
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
    background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
    color: '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 11,
    fontFamily: 'monospace', width: '100%'
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
      <SectionHead>Connect New Printer</SectionHead>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>ID (unique key)</div>
          <input value={form.id} onChange={e => set('id', e.target.value)} placeholder="bambu-x1c-1" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Display Name</div>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Bambu X1C #1" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Model</div>
          <input value={form.model} onChange={e => set('model', e.target.value)} placeholder="BambuX1C" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Default Material</div>
          <select value={form.material_type} onChange={e => set('material_type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {SLICER_MATS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: '#444', marginBottom: 6 }}>Connection Type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CONN_TYPES.map(c => (
            <button key={c.value} onClick={() => set('connection_type', c.value)} style={{
              padding: '5px 12px', fontSize: 9, cursor: 'pointer', borderRadius: 5, fontWeight: 600,
              background: ct === c.value ? '#00ff8815' : 'transparent',
              color: ct === c.value ? '#00ff88' : '#2a2a2a',
              border: ct === c.value ? '1px solid #00ff8830' : '1px solid #1a1a1a',
            }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 5 }}>
          {CONN_TYPES.find(c => c.value === ct)?.hint}
        </div>
      </div>

      {ct !== 'manual' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>
            {ct === 'bambu' ? 'Printer IP Address' : 'Host URL (e.g. http://192.168.1.50)'}
          </div>
          <input value={form.host} onChange={e => set('host', e.target.value)}
            placeholder={ct === 'bambu' ? '192.168.1.50' : 'http://192.168.1.50'} style={inp} />
        </div>
      )}

      {ct === 'bambu' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Device Serial Number</div>
            <input value={form.serial} onChange={e => set('serial', e.target.value)}
              placeholder="01P00A123456789" style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>Access Code (from screen)</div>
            <input value={form.access_code} onChange={e => set('access_code', e.target.value)}
              type="password" placeholder="12345678" style={inp} />
          </div>
        </div>
      )}

      {ct === 'octoprint' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>OctoPrint API Key</div>
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
          flex: 1, padding: '8px', background: saving ? '#111' : '#00ff88', color: saving ? '#333' : '#000',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer'
        }}>{saving ? 'Connecting...' : '+ Add Printer'}</button>
        <button onClick={onCancel} style={{
          padding: '8px 14px', background: 'transparent', border: '1px solid #1a1a1a',
          color: '#333', borderRadius: 6, cursor: 'pointer', fontSize: 11
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Queue Card ────────────────────────────────────────────────────────────────

function QueueCard({ job, printers, onAssign, onCancel, onAdvance }) {
  const matColor = MAT_COLOR[job.material] || '#555'
  const [assigning, setAssigning] = useState(false)
  const idlePrinters = printers.filter(p => p.status === 'idle')
  const stageIdx = ORDER_STAGES.indexOf(job.status)
  const color = ORDER_COLOR[job.status] || '#444'
  const canAdvance = stageIdx >= 0 && stageIdx < ORDER_STAGES.length - 1
  const canBack = stageIdx > 0

  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#ccc', fontFamily: 'monospace', fontWeight: 600, marginBottom: 3 }}>
            {job.name || job.spec_id || job.id || 'job'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <Tag color={matColor}>{job.material || 'PLA'}</Tag>
            {job.qty > 1 && <Tag color="#888">×{job.qty}</Tag>}
            {job.priority === 'high' && <Tag color="#ff4444">URGENT</Tag>}
            <Tag color={color}>{ORDER_ICON[job.status]} {job.status}</Tag>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {job.est_time_min && <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{job.est_time_min}min</div>}
          {job.est_cost && <div style={{ fontSize: 9, color: '#2a2a2a' }}>${job.est_cost}</div>}
        </div>
      </div>

      {/* Stage progress bar */}
      {stageIdx >= 0 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
          {ORDER_STAGES.map((s, i) => (
            <div key={s} title={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : '#111'
            }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Stage navigation */}
        {canBack && (
          <button onClick={() => onAdvance(job.id || job.spec_id, ORDER_STAGES[stageIdx - 1])} style={{
            fontSize: 9, padding: '3px 8px', background: 'transparent',
            border: '1px solid #1a1a1a', color: '#444', cursor: 'pointer', borderRadius: 3
          }}>← Back</button>
        )}
        {canAdvance && (
          <button onClick={() => onAdvance(job.id || job.spec_id, ORDER_STAGES[stageIdx + 1])} style={{
            fontSize: 9, padding: '3px 10px', background: '#00ff8812',
            border: '1px solid #00ff8830', color: '#00ff88', cursor: 'pointer', borderRadius: 3, fontWeight: 700
          }}>Next →</button>
        )}

        {/* Assign to printer (when PRINTING stage) */}
        {job.status === 'NEW' || job.status === 'AI_PREP' ? (
          assigning && idlePrinters.length > 0 ? (
            <>
              <span style={{ fontSize: 9, color: '#444' }}>Assign to:</span>
              {idlePrinters.map(p => (
                <button key={p.id} onClick={() => { onAssign(job.id || job.spec_id, p.id); setAssigning(false) }} style={{
                  fontSize: 9, padding: '3px 8px', background: '#00ff8812', border: '1px solid #00ff8830',
                  color: '#00ff88', cursor: 'pointer', borderRadius: 3
                }}>{p.name}</button>
              ))}
              <button onClick={() => setAssigning(false)} style={{
                fontSize: 9, padding: '3px 6px', background: 'transparent', border: '1px solid #1a1a1a',
                color: '#333', cursor: 'pointer', borderRadius: 3
              }}>✕</button>
            </>
          ) : (
            <button onClick={() => setAssigning(true)} disabled={idlePrinters.length === 0} style={{
              fontSize: 9, padding: '3px 10px', background: idlePrinters.length > 0 ? '#4a9eff12' : '#111',
              border: `1px solid ${idlePrinters.length > 0 ? '#4a9eff30' : '#1a1a1a'}`,
              color: idlePrinters.length > 0 ? '#4a9eff' : '#2a2a2a',
              cursor: idlePrinters.length > 0 ? 'pointer' : 'default', borderRadius: 3
            }}>
              {idlePrinters.length > 0 ? '⬡ Assign Printer' : 'No idle printers'}
            </button>
          )
        ) : null}

        <button onClick={() => onCancel(job.id || job.spec_id)} style={{
          fontSize: 9, padding: '3px 8px', background: 'transparent', marginLeft: 'auto',
          border: '1px solid #1a1a1a', color: '#333', cursor: 'pointer', borderRadius: 3
        }}>✕</button>
      </div>
      {job.notes && <div style={{ fontSize: 9, color: '#333', marginTop: 6, fontStyle: 'italic' }}>{job.notes}</div>}
    </div>
  )
}

// ─── Kanban Column + Card ─────────────────────────────────────────────────────

function KanbanCard({ job, stage, onMove, onCancel }) {
  const matColor = MAT_COLOR[job.material] || '#555'
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('jobId', job.id || job.spec_id); e.dataTransfer.setData('fromStage', stage) }}
      style={{
        background: dragOver ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 7, padding: '10px 12px', marginBottom: 6, cursor: 'grab',
        transition: 'background 0.1s'
      }}
    >
      <div style={{ fontSize: 10, color: '#bbb', fontWeight: 600, marginBottom: 4, fontFamily: 'monospace' }}>
        {job.name || job.spec_id || job.id}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <Tag color={matColor}>{job.material || 'PLA'}</Tag>
        {job.qty > 1 && <Tag color="#888">×{job.qty}</Tag>}
        {job.priority === 'high' && <Tag color="#ff4444">!</Tag>}
      </div>
      {job.est_time_min && <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: 'monospace' }}>{job.est_time_min}min</div>}
      {job.assigned_printer && <div style={{ fontSize: 8, color: '#4a9eff', marginTop: 2 }}>⬡ {job.assigned_printer}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {ORDER_STAGES.indexOf(stage) > 0 && (
          <button onClick={() => onMove(job.id || job.spec_id, ORDER_STAGES[ORDER_STAGES.indexOf(stage) - 1])} style={{
            fontSize: 8, padding: '2px 6px', background: 'transparent', border: '1px solid #1a1a1a',
            color: '#444', cursor: 'pointer', borderRadius: 3
          }}>←</button>
        )}
        {ORDER_STAGES.indexOf(stage) < ORDER_STAGES.length - 1 && (
          <button onClick={() => onMove(job.id || job.spec_id, ORDER_STAGES[ORDER_STAGES.indexOf(stage) + 1])} style={{
            fontSize: 8, padding: '2px 6px', background: '#00ff8810', border: '1px solid #00ff8820',
            color: '#00ff88', cursor: 'pointer', borderRadius: 3
          }}>→</button>
        )}
        <button onClick={() => onCancel(job.id || job.spec_id)} style={{
          fontSize: 8, padding: '2px 5px', background: 'transparent', border: '1px solid #1a1a1a',
          color: '#2a2a2a', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto'
        }}>✕</button>
      </div>
    </div>
  )
}

function KanbanColumn({ stage, jobs, onMove, onCancel, onDrop }) {
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
        background: dragOver ? `${color}08` : 'rgba(255,255,255,0.01)',
        border: `1px solid ${dragOver ? color + '30' : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 8, padding: '10px 10px 6px', transition: 'all 0.15s'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color }}>{icon}</span>
          <span style={{ fontSize: 9, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stage.replace('_', ' ')}</span>
        </div>
        {jobs.length > 0 && (
          <span style={{ fontSize: 9, background: color + '22', color, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{jobs.length}</span>
        )}
      </div>
      {jobs.length === 0 ? (
        <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, color: '#1a1a1a' }}>drop here</span>
        </div>
      ) : (
        jobs.map(job => (
          <KanbanCard key={job.id || job.spec_id} job={job} stage={stage} onMove={onMove} onCancel={onCancel} />
        ))
      )}
    </div>
  )
}

// ─── Add Order Form ───────────────────────────────────────────────────────────

function AddOrderForm({ onSave, onCancel, base }) {
  const [form, setForm] = useState({ name: '', material: 'PLA', qty: 1, priority: 'normal', est_time_min: '', est_cost: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = {
    background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
    color: '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 11,
    fontFamily: 'monospace', width: '100%'
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body = { ...form, qty: Number(form.qty) }
      if (form.est_time_min) body.est_time_min = Number(form.est_time_min)
      if (form.est_cost) body.est_cost = Number(form.est_cost)
      const r = await fetch(`${base}/api/v1/farm/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      onSave(await r.json())
    } catch { /* noop */ }
    setSaving(false)
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 16, marginBottom: 14 }}>
      <SectionHead>New Work Order</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Job Name / ID</div>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="gridfinity-bin-v3" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Material</div>
          <select value={form.material} onChange={e => set('material', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {SLICER_MATS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Quantity</div>
          <input type="number" min={1} value={form.qty} onChange={e => set('qty', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Priority</div>
          <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="normal">Normal</option>
            <option value="high">High / Urgent</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Est. Time (min)</div>
          <input type="number" value={form.est_time_min} onChange={e => set('est_time_min', e.target.value)} placeholder="120" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Est. Cost ($)</div>
          <input type="number" step="0.01" value={form.est_cost} onChange={e => set('est_cost', e.target.value)} placeholder="2.50" style={inp} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Notes</div>
        <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: '7px', background: saving ? '#111' : '#00ff88', color: saving ? '#333' : '#000',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer'
        }}>{saving ? 'Adding...' : '+ Add to Kanban'}</button>
        <button onClick={onCancel} style={{
          padding: '7px 14px', background: 'transparent', border: '1px solid #1a1a1a',
          color: '#333', borderRadius: 6, cursor: 'pointer', fontSize: 11
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Filament Spool Card ────────────────────────────────────────────────────────

function SpoolCard({ spool, onDelete, onEdit }) {
  const color = MAT_COLOR[spool.material] || '#888'
  const pct = spool.remaining_pct ?? (spool.remaining_g && spool.total_g ? Math.round((spool.remaining_g / spool.total_g) * 100) : null)
  const low = pct != null && pct < 20

  return (
    <div style={{
      background: low ? 'rgba(255,68,68,0.04)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${low ? '#ff444422' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 8, padding: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: spool.hex_color || color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#ccc', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {spool.brand ? `${spool.brand} ` : ''}{spool.material}
          </div>
          <div style={{ fontSize: 9, color: '#333' }}>{spool.color_name || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {low && <Tag color="#ff4444">LOW</Tag>}
        </div>
      </div>
      {pct != null && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: '#333' }}>Remaining</span>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: low ? '#ff4444' : color }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={low ? '#ff4444' : color} height={4} />
          {spool.remaining_g != null && (
            <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 4 }}>
              {spool.remaining_g}g / {spool.total_g}g · ${((spool.remaining_g * (spool.cost_per_g || 0.025))).toFixed(2)} value
            </div>
          )}
        </>
      )}
      {spool.assigned_printer && (
        <div style={{ fontSize: 8, color: '#4a9eff', marginTop: 4 }}>⬡ {spool.assigned_printer}</div>
      )}
      {spool.notes && <div style={{ fontSize: 8, color: '#2a2a2a', marginTop: 3, fontStyle: 'italic' }}>{spool.notes}</div>}
      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
        <button onClick={() => onEdit && onEdit(spool)} style={{
          fontSize: 8, padding: '2px 8px', background: 'transparent', border: '1px solid #1a1a1a', color: '#444', cursor: 'pointer', borderRadius: 3
        }}>Edit</button>
        <button onClick={() => onDelete && onDelete(spool.id)} style={{
          fontSize: 8, padding: '2px 8px', background: 'transparent', border: '1px solid #1a1a1a', color: '#ff444466', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto'
        }}>Remove</button>
      </div>
    </div>
  )
}

// ─── Add Spool Form ───────────────────────────────────────────────────────────

function AddSpoolForm({ onSave, onCancel, base, initialData, printers }) {
  const [form, setForm] = useState(initialData || {
    material: 'PLA', brand: '', color_name: '', hex_color: '#00ff88',
    total_g: 1000, remaining_g: 1000, cost_per_g: 0.025, assigned_printer: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = {
    background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
    color: '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 11,
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
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 16, marginBottom: 14 }}>
      <SectionHead>{initialData ? 'Edit Spool' : 'Add Filament Spool'}</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Material</div>
          <select value={form.material} onChange={e => set('material', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {SPOOL_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Brand</div>
          <input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Bambu Lab" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Color Name</div>
          <input value={form.color_name} onChange={e => set('color_name', e.target.value)} placeholder="Bambu Green" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Color</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={form.hex_color} onChange={e => set('hex_color', e.target.value)}
              style={{ width: 36, height: 32, border: 'none', padding: 2, background: 'transparent', cursor: 'pointer' }} />
            <input value={form.hex_color} onChange={e => set('hex_color', e.target.value)} style={{ ...inp, flex: 1 }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Total Weight (g)</div>
          <input type="number" value={form.total_g} onChange={e => set('total_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Remaining (g)</div>
          <input type="number" value={form.remaining_g} onChange={e => set('remaining_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Cost per gram ($)</div>
          <input type="number" step="0.001" value={form.cost_per_g} onChange={e => set('cost_per_g', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Assign to Printer</div>
          <select value={form.assigned_printer || ''} onChange={e => set('assigned_printer', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">— Unassigned —</option>
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: '#444', marginBottom: 3 }}>Notes</div>
        <input value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." style={inp} />
      </div>
      {/* Cost preview */}
      <div style={{ fontSize: 9, color: '#2a2a2a', marginBottom: 10 }}>
        Estimated value: ${(Number(form.remaining_g) * Number(form.cost_per_g)).toFixed(2)}
        {' · '}
        Total spool: ${(Number(form.total_g) * Number(form.cost_per_g)).toFixed(2)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: '7px', background: saving ? '#111' : '#00ff88', color: saving ? '#333' : '#000',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer'
        }}>{saving ? 'Saving...' : initialData ? 'Save Changes' : '+ Add Spool'}</button>
        <button onClick={onCancel} style={{
          padding: '7px 14px', background: 'transparent', border: '1px solid #1a1a1a',
          color: '#333', borderRadius: 6, cursor: 'pointer', fontSize: 11
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ alert }) {
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
        <div style={{ fontSize: 10, color: '#ccc', fontWeight: 600, marginBottom: 2 }}>{alert.title}</div>
        <div style={{ fontSize: 9, color: '#444', lineHeight: 1.6 }}>{alert.message}</div>
        {alert.ts && <div style={{ fontSize: 8, color: '#2a2a2a', marginTop: 3 }}>{new Date(alert.ts).toLocaleTimeString()}</div>}
      </div>
    </div>
  )
}

// ─── Slice Card ────────────────────────────────────────────────────────────────

function SliceCard({ entry }) {
  const flagged = entry.flagged_for_review
  const timeDiff = entry.actual_time_seconds && entry.claimed_time_seconds
    ? Math.round(((entry.actual_time_seconds - entry.claimed_time_seconds) / entry.claimed_time_seconds) * 100) : null
  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)',
      border: `1px solid ${flagged ? '#ff980022' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 8, padding: '11px 13px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace' }}>{entry.spec_id || 'slice'}</span>
        <Tag color={flagged ? '#ff9800' : '#00ff88'}>{flagged ? '⚠ FLAGGED' : '✓ PASS'}</Tag>
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
            <div style={{ fontSize: 8, color: '#2a2a2a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
            <div style={{ fontSize: 10, color: k === 'Δ Time' && timeDiff && Math.abs(timeDiff) > 10 ? '#ff9800' : '#888', fontFamily: 'monospace', marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 7, fontSize: 8, color: '#1e1e1e' }}>{new Date(entry.received_at).toLocaleString()}</div>
    </div>
  )
}

// ─── Order Row ─────────────────────────────────────────────────────────────────

function OrderRow({ order }) {
  const stageIdx = ORDER_STAGES.indexOf(order.status)
  const color = ORDER_COLOR[order.status] || '#444'
  const matColor = MAT_COLOR[order.material] || '#555'
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#bbb', fontFamily: 'monospace', fontWeight: 600 }}>{order.name || order.spec_id || order.id}</span>
          <Tag color={matColor}>{order.material || 'PLA'}</Tag>
          {order.qty > 1 && <span style={{ fontSize: 9, color: '#333' }}>×{order.qty}</span>}
        </div>
        <Tag color={color}>{order.status || 'NEW'}</Tag>
      </div>
      {stageIdx >= 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {ORDER_STAGES.map((s, i) => (
            <div key={s} title={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stageIdx ? (ORDER_COLOR[ORDER_STAGES[i]] || '#555') : '#111'
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Analytics helpers ─────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color = '#00ff88', unit = '' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#555' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color }}>{value}{unit}</span>
      </div>
      <ProgressBar pct={pct} color={color} height={4} />
    </div>
  )
}

// ─── Slicer UI helpers ────────────────────────────────────────────────────────

function DropZone({ file, onFile }) {
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
        border: `1px dashed ${dragging ? '#00ff88' : file ? '#00ff8844' : '#1e1e1e'}`,
        borderRadius: 8, padding: 14, cursor: 'pointer', textAlign: 'center',
        background: dragging ? '#00ff8808' : file ? '#00ff8803' : 'rgba(255,255,255,0.01)',
        transition: 'all 0.15s', marginBottom: 14
      }}
    >
      <input ref={inputRef} type="file" accept=".stl,.3mf,.obj" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <>
          <div style={{ fontSize: 18, marginBottom: 4 }}>📄</div>
          <div style={{ fontSize: 10, color: '#00ff88', fontFamily: 'monospace', wordBreak: 'break-all' }}>{file.name}</div>
          <div style={{ fontSize: 9, color: '#333', marginTop: 3 }}>{(file.size / 1024).toFixed(0)} KB · click to change</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, opacity: 0.12, marginBottom: 6 }}>⬆</div>
          <div style={{ fontSize: 10, color: '#2a2a2a' }}>Drop STL / 3MF / OBJ or click to browse</div>
          <div style={{ fontSize: 9, color: '#1a1a1a', marginTop: 3 }}>or slice the last generated design below</div>
        </>
      )}
    </div>
  )
}

function SlicerParam({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 9, color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.08em', width: 100, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const selectStyle = {
  width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
  color: '#bbb', padding: '5px 8px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer'
}

const numStyle = {
  width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)',
  color: '#bbb', padding: '5px 8px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', textAlign: 'right'
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [farm, setFarm] = useState({ printers: [], stats: {}, orders: [], feedback: [] })
  const [queue, setQueue] = useState([])
  const [inventory, setInventory] = useState([])
  const [sliceStatus, setSliceStatus] = useState(null)
  const [slicing, setSlicing] = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [alertsOpen, setAlertsOpen] = useState(false)

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

  // Work orders / Kanban
  const [showAddOrder, setShowAddOrder] = useState(false)

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

  const TABS = [
    { id: 'overview',   label: 'Overview',   icon: '◉' },
    { id: 'kanban',     label: 'Kanban',      icon: '▦', badge: activeOrders.length || null },
    { id: 'queue',      label: 'Queue',       icon: '≡', badge: queue.length || null },
    { id: 'printers',   label: 'Printers',    icon: '⬡', badge: errored || null },
    { id: 'analytics',  label: 'Analytics',   icon: '◎' },
    { id: 'inventory',  label: 'Inventory',   icon: '⬜', badge: lowSpools.length || null },
    { id: 'slicer',     label: 'Slicer',      icon: '◈' },
  ]

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
    <div style={{ minHeight: '100vh', padding: '20px 24px', fontFamily: "'Inter', system-ui, sans-serif", color: 'white', background: '#080808' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(1.5)} }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width: 3px; height: 3px } ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 2px }
      `}</style>

      {/* API URL bar */}
      {isLocalhost && (
        <div style={{
          background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.2)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 9, color: '#ff9800', flexShrink: 0 }}>BACKEND URL</span>
          <input value={apiUrl} onChange={e => updateApiUrl(e.target.value)} placeholder="https://your-app.railway.app"
            style={{ flex: 1, background: '#0d0d0d', border: '1px solid rgba(255,152,0,0.2)', color: '#ccc', padding: '5px 10px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace' }} />
        </div>
      )}
      {!isLocalhost && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#2a2a2a' }}>API:</span>
          <input value={apiUrl} onChange={e => updateApiUrl(e.target.value)}
            style={{ width: 280, background: 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a', color: '#2a2a2a', padding: '2px 4px', fontSize: 9, fontFamily: 'monospace' }} />
        </div>
      )}

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div onClick={() => setAlertsOpen(v => !v)} style={{
          background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.15)',
          borderRadius: 7, padding: '8px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#ff9800', fontSize: 11 }}>⚠</span>
            <span style={{ fontSize: 10, color: '#888' }}>{alerts.length} issue{alerts.length > 1 ? 's' : ''} need attention</span>
            <span style={{ fontSize: 9, color: '#333' }}>— click to {alertsOpen ? 'hide' : 'view'}</span>
          </div>
          <span style={{ fontSize: 9, color: '#333' }}>{alertsOpen ? '▲' : '▼'}</span>
        </div>
      )}
      {alertsOpen && alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>{alerts.map((a, i) => <AlertCard key={i} alert={a} />)}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#00ff88' }}>printdash</span>
            <span style={{ fontSize: 10, color: '#222' }}>by fofus.in</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PulsingDot color={error ? '#ff4444' : '#00ff88'} />
            <span style={{ fontSize: 9, color: error ? '#ff4444' : '#333' }}>
              {error ? `offline — ${error}` : lastPoll ? `live · ${lastPoll.toLocaleTimeString()}` : 'connecting...'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '5px 11px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 5,
              background: tab === t.id ? '#00ff8812' : 'transparent',
              color: tab === t.id ? '#00ff88' : '#2a2a2a',
              border: tab === t.id ? '1px solid #00ff8828' : '1px solid transparent',
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
            background: 'transparent', border: '1px solid #111', color: '#2a2a2a'
          }}>↻</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard icon="📦" label="Active Orders" value={activeOrders.length || (stats.active_orders ?? '—')} color="#00ff88" sub={`${allOrders.length} total`} />
        <StatCard icon="⬡" label="Printing" value={printing} color="#4a9eff" sub={`${idle} idle · ${printers.length} total`} />
        <StatCard icon="◎" label="Utilization" value={printers.length > 0 ? `${utilization}%` : '—'} color={utilization > 70 ? '#00ff88' : utilization > 40 ? '#ff9800' : '#555'} sub="fleet capacity" />
        <StatCard icon="⚠" label="Flagged" value={alerts.length > 0 ? alerts.length : (stats.flagged ?? 0)} color="#ff9800" sub="needs review" alert={alerts.length > 0} />
        <StatCard icon="✓" label="Success Rate" value={successRate != null ? `${successRate}%` : '—'} color={successRate > 90 ? '#00ff88' : '#ff9800'} sub={`${feedback.length} slices`} />
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
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
      {tab === 'kanban' && (
        <div>
          <SectionHead
            action={
              <button onClick={() => setShowAddOrder(v => !v)} style={{
                fontSize: 9, padding: '4px 12px', background: showAddOrder ? 'transparent' : '#00ff8812',
                border: `1px solid ${showAddOrder ? '#1a1a1a' : '#00ff8830'}`,
                color: showAddOrder ? '#333' : '#00ff88', cursor: 'pointer', borderRadius: 5, fontWeight: 600
              }}>{showAddOrder ? '✕ Cancel' : '+ New Order'}</button>
            }
          >
            Kanban Board — {activeOrders.length} active
          </SectionHead>

          {showAddOrder && (
            <AddOrderForm
              base={apiUrlRef.current}
              onSave={() => { setShowAddOrder(false); poll() }}
              onCancel={() => setShowAddOrder(false)}
            />
          )}

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
              />
            ))}
          </div>

          <div style={{ marginTop: 8, fontSize: 8, color: '#1a1a1a' }}>
            Drag cards between columns to advance stages · Click → or ← buttons on each card
          </div>
        </div>
      )}

      {/* ── QUEUE ────────────────────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <div style={{ maxWidth: 680 }}>
          <SectionHead>Print Queue — {queue.length} job{queue.length !== 1 ? 's' : ''}</SectionHead>
          {queue.length === 0
            ? <EmptyState icon="≡" title="Queue is empty"
                hint="Jobs appear here when submitted from the Design Studio.\nAdd work orders in the Kanban tab."
              />
            : queue.map(j => (
                <QueueCard key={j.id || j.spec_id} job={j} printers={printers}
                  onAssign={assignJob} onCancel={cancelJob} onAdvance={advanceOrder} />
              ))
          }

          {printers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <SectionHead>Printer Status</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {printers.map(p => {
                  const color = STATUS_COLOR[p.status] || '#555'
                  return (
                    <div key={p.id} style={{
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}18`,
                      borderRadius: 7, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8
                    }}>
                      <PulsingDot color={color} />
                      <div>
                        <div style={{ fontSize: 10, color: '#ccc', fontWeight: 600 }}>{p.name}</div>
                        <Tag color={color}>{p.status}</Tag>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PRINTERS ─────────────────────────────────────────────────────────── */}
      {tab === 'printers' && (
        <div style={{ maxWidth: 720 }}>
          <SectionHead
            action={
              <button onClick={() => setShowAddPrinter(v => !v)} style={{
                fontSize: 9, padding: '4px 12px', background: showAddPrinter ? 'transparent' : '#00ff8812',
                border: `1px solid ${showAddPrinter ? '#1a1a1a' : '#00ff8830'}`,
                color: showAddPrinter ? '#333' : '#00ff88', cursor: 'pointer', borderRadius: 5, fontWeight: 600
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
                  { icon: '◉', name: 'Bambu LAN', desc: 'X1C, P1S, A1 — Enable LAN Mode on printer. Find Access Code in Settings → WLAN.', color: '#00ff88' },
                  { icon: '⬡', name: 'Moonraker', desc: 'Voron, Ender3 with Klipper — Enter your Mainsail or Fluidd URL.', color: '#4a9eff' },
                  { icon: '○', name: 'OctoPrint', desc: 'Any FDM printer via OctoPrint — Enter host URL and API key.', color: '#ff9800' },
                ].map(c => (
                  <div key={c.name} style={{ background: `${c.color}08`, border: `1px solid ${c.color}18`, borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, color: c.color, fontWeight: 700, marginBottom: 4 }}>{c.icon} {c.name}</div>
                    <div style={{ fontSize: 9, color: '#333', lineHeight: 1.6 }}>{c.desc}</div>
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
                  border: '1px solid #1a1a1a', color: '#ff444444', cursor: 'pointer', borderRadius: 3
                }}>Remove printer</button>
              </div>
            </div>
          ))}

          {printers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <SectionHead>Fleet Health</SectionHead>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16 }}>
                {[
                  ['Printing', printing, printers.length, '#00ff88'],
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
      {tab === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <SectionHead>Fleet Performance</SectionHead>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              {printers.length === 0
                ? <div style={{ fontSize: 10, color: '#2a2a2a' }}>No printer data yet</div>
                : <>
                  <MiniBar label="Utilization" value={utilization} max={100} color={utilization > 70 ? '#00ff88' : '#ff9800'} unit="%" />
                  <MiniBar label="Printing" value={printing} max={printers.length} color="#00ff88" unit={` of ${printers.length}`} />
                  <MiniBar label="Idle" value={idle} max={printers.length} color="#4a9eff" unit={` of ${printers.length}`} />
                  {errored > 0 && <MiniBar label="In Error" value={errored} max={printers.length} color="#ff4444" unit={` of ${printers.length}`} />}
                </>
              }
            </div>

            <SectionHead>Kanban Pipeline</SectionHead>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16 }}>
              {allOrders.length === 0
                ? <div style={{ fontSize: 10, color: '#2a2a2a' }}>No orders yet</div>
                : ORDER_STAGES.map(stage => {
                    const count = kanbanByStage[stage]?.length ?? 0
                    if (count === 0) return null
                    return <MiniBar key={stage} label={stage.replace('_', ' ')} value={count} max={allOrders.length} color={ORDER_COLOR[stage] || '#555'} unit={` job${count > 1 ? 's' : ''}`} />
                  })
              }
            </div>
          </div>

          <div>
            <SectionHead>Slice Quality</SectionHead>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              {feedback.length === 0
                ? <div style={{ fontSize: 10, color: '#2a2a2a' }}>No slice data yet</div>
                : <>
                  <MiniBar label="Success Rate" value={successRate} max={100} color={successRate > 90 ? '#00ff88' : '#ff9800'} unit="%" />
                  <MiniBar label="Passed" value={feedback.filter(f => !f.flagged_for_review).length} max={feedback.length} color="#00ff88" unit={` of ${feedback.length}`} />
                  <MiniBar label="Flagged" value={feedback.filter(f => f.flagged_for_review).length} max={feedback.length} color="#ff9800" unit={` of ${feedback.length}`} />
                </>
              }
            </div>

            <SectionHead>Material Breakdown</SectionHead>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16 }}>
              {Object.keys(matBreakdown).length === 0
                ? <div style={{ fontSize: 10, color: '#2a2a2a' }}>No order data yet</div>
                : Object.entries(matBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .map(([mat, count]) => (
                      <MiniBar key={mat} label={mat} value={count} max={maxMatCount} color={MAT_COLOR[mat] || '#555'} unit=" jobs" />
                    ))
              }
            </div>

            {inventory.length > 0 && (
              <>
                <SectionHead style={{ marginTop: 16 }}>Filament Stock</SectionHead>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, marginTop: 16 }}>
                  {inventory.map((s, i) => {
                    const pct = s.remaining_pct ?? (s.remaining_g && s.total_g ? Math.round(s.remaining_g / s.total_g * 100) : null)
                    const color = MAT_COLOR[s.material] || '#888'
                    return pct != null ? (
                      <MiniBar key={i} label={`${s.brand || ''} ${s.material} ${s.color_name || ''}`.trim()} value={pct} max={100} color={pct < 20 ? '#ff4444' : color} unit="%" />
                    ) : null
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── INVENTORY ────────────────────────────────────────────────────────── */}
      {tab === 'inventory' && (
        <div>
          <SectionHead
            action={
              <button onClick={() => { setShowAddSpool(v => !v); setEditSpool(null) }} style={{
                fontSize: 9, padding: '4px 12px', background: showAddSpool ? 'transparent' : '#00ff8812',
                border: `1px solid ${showAddSpool ? '#1a1a1a' : '#00ff8830'}`,
                color: showAddSpool ? '#333' : '#00ff88', cursor: 'pointer', borderRadius: 5, fontWeight: 600
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
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 14, display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Total Filament</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#ccc' }}>
                    {inventory.reduce((s, sp) => s + (sp.remaining_g || 0), 0).toFixed(0)}g
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Estimated Value</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#00ff88' }}>
                    ${inventory.reduce((s, sp) => s + (sp.remaining_g || 0) * (sp.cost_per_g || 0.025), 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Low Stock</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: lowSpools.length > 0 ? '#ff4444' : '#ccc' }}>
                    {lowSpools.length} spool{lowSpools.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SLICER ─────────────────────────────────────────────────────────────── */}
      {tab === 'slicer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>

          <div>
            <SectionHead>Backend Connection</SectionHead>
            <div style={{
              background: isLocalhost ? 'rgba(255,152,0,0.06)' : 'rgba(0,255,136,0.04)',
              border: `1px solid ${isLocalhost ? 'rgba(255,152,0,0.2)' : 'rgba(0,255,136,0.1)'}`,
              borderRadius: 8, padding: '10px 12px', marginBottom: 14
            }}>
              <div style={{ fontSize: 9, color: isLocalhost ? '#ff9800' : '#00ff88', marginBottom: 6, fontWeight: 600 }}>
                {isLocalhost ? '⚠ Not connected — set your Railway URL' : '✓ Connected'}
              </div>
              <input value={apiUrl} onChange={e => updateApiUrl(e.target.value)} placeholder="https://your-app.railway.app"
                style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${isLocalhost ? 'rgba(255,152,0,0.2)' : 'rgba(0,255,136,0.15)'}`, color: '#ccc', padding: '6px 10px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace' }} />
              <div style={{ fontSize: 8, color: '#2a2a2a', marginTop: 5, lineHeight: 1.6 }}>
                Railway → backend service → Settings → Networking → Public URL
              </div>
            </div>

            <SectionHead>File</SectionHead>
            <DropZone file={slicerFile} onFile={setSlicerFile} />
            {slicerFile && (
              <button onClick={() => setSlicerFile(null)} style={{
                fontSize: 9, padding: '3px 10px', background: 'transparent', border: '1px solid #1e1e1e',
                color: '#333', cursor: 'pointer', borderRadius: 4, marginBottom: 14, display: 'block'
              }}>✕ clear file</button>
            )}

            <SectionHead>Quick Preset</SectionHead>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {Object.keys(SLICER_PRESETS).map(name => (
                <button key={name} onClick={() => applyPreset(name)} style={{
                  flex: 1, padding: '6px 4px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 5,
                  background: activePreset === name ? '#00ff8815' : 'transparent',
                  color: activePreset === name ? '#00ff88' : '#2a2a2a',
                  border: activePreset === name ? '1px solid #00ff8830' : '1px solid #1a1a1a',
                  transition: 'all 0.15s'
                }}>{name}</button>
              ))}
            </div>

            <SectionHead>Print Setup</SectionHead>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 6px' }}>
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
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
              <SlicerParam label="Density">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={0} max={100} step={5} value={slicerSettings.infillDensity}
                    onChange={e => setSetting('infillDensity', Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#00ff88' }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#00ff88', width: 36, textAlign: 'right' }}>
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
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
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
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 10px', marginBottom: 14 }}>
              <SlicerParam label="Type">
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['none', 'None'], ['normal', 'Normal'], ['tree', 'Tree (Organic)']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setSetting('supportType', val)} style={{
                      flex: 1, padding: '5px 4px', fontSize: 9, cursor: 'pointer', borderRadius: 4,
                      background: slicerSettings.supportType === val ? '#4a9eff18' : 'transparent',
                      color: slicerSettings.supportType === val ? '#4a9eff' : '#2a2a2a',
                      border: slicerSettings.supportType === val ? '1px solid #4a9eff30' : '1px solid #1a1a1a',
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
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 6px', marginBottom: 14 }}>
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
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 14px 6px', marginBottom: 18 }}>
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
              background: slicing ? '#0d0d0d' : '#00ff88',
              color: slicing ? '#333' : '#000',
              border: slicing ? '1px solid #1a1a1a' : 'none',
              fontWeight: 800, fontSize: 12, cursor: slicing ? 'default' : 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.2s'
            }}>
              {slicing ? '⏳ Slicing...' : `◈ Slice Now${slicerFile ? ` — ${slicerFile.name.slice(0, 20)}` : ''}`}
            </button>
            <div style={{ fontSize: 8, color: '#1a1a1a', marginTop: 6, textAlign: 'center' }}>
              {slicerMachine} · {slicerMaterial} · {slicerSettings.layerHeight}mm · {slicerSettings.infillDensity}% {slicerSettings.infillPattern}
              {slicerSettings.supportType !== 'none' ? ` · ${slicerSettings.supportType} supports` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
