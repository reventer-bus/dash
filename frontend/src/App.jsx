import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react'

export const AppThemeCtx = createContext(false)
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Dashboard from './Dashboard.jsx'

const DEFAULT_PARAMS = { grid_x: 1, grid_y: 1, height_u: 3, wall: 1.2 }
const DEFAULT_VASE = { base_r: 20, amplitude: 8, frequency: 4, height: 80 }

const MATERIALS = {
  PLA:  { label: 'PLA',  color: '#00ff88', costPerGram: 0.025 },
  PETG: { label: 'PETG', color: '#00aaff', costPerGram: 0.030 },
  ABS:  { label: 'ABS',  color: '#ff9800', costPerGram: 0.028 },
  TPU:  { label: 'TPU',  color: '#aa44ff', costPerGram: 0.040 },
}

function buildBinarySTL(verts) {
  const triCount = verts.length / 9
  const buf = new ArrayBuffer(84 + triCount * 50)
  const view = new DataView(buf)
  // 80-byte header
  for (let i = 0; i < 80; i++) view.setUint8(i, 0)
  view.setUint32(80, triCount, true)
  let offset = 84
  for (let t = 0; t < triCount; t++) {
    const base = t * 9
    // normal (0,0,0 — let slicer compute)
    view.setFloat32(offset, 0, true); offset += 4
    view.setFloat32(offset, 0, true); offset += 4
    view.setFloat32(offset, 0, true); offset += 4
    for (let v = 0; v < 3; v++) {
      view.setFloat32(offset, verts[base + v * 3],     true); offset += 4
      view.setFloat32(offset, verts[base + v * 3 + 1], true); offset += 4
      view.setFloat32(offset, verts[base + v * 3 + 2], true); offset += 4
    }
    view.setUint16(offset, 0, true); offset += 2
  }
  return buf
}

function Slider({ label, value, min, max, step, onChange, accent = '#00ff88' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
        <span style={{ fontSize: 11, color: accent, fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: accent }} />
    </div>
  )
}

function ModeTab({ id, label, icon, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      flex: 1, padding: '7px 2px', fontSize: 9, cursor: 'pointer',
      background: active ? '#00ff8818' : 'transparent',
      color: active ? '#00ff88' : '#333',
      border: active ? '1px solid #00ff8833' : '1px solid transparent',
      fontWeight: active ? 700 : 400, letterSpacing: '0.08em',
      textTransform: 'uppercase', transition: 'all 0.15s', borderRadius: 4,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('pd_dark') === '1')
  const [status, setStatus] = useState('starting...')
  const [mode, setMode] = useState('gridfinity')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [vaseParams, setVaseParams] = useState(DEFAULT_VASE)
  const [history, setHistory] = useState([{ ...DEFAULT_PARAMS, ts: Date.now(), msg: 'initial' }])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [material, setMaterial] = useState('PLA')
  const [qty, setQty] = useState(1)
  const [farmResponse, setFarmResponse] = useState(null)
  const [farmLoading, setFarmLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const pendingActionRef = useRef(null)
  const vertsRef = useRef(null)

  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const meshRef = useRef(null)
  const sceneRef = useRef(null)

  const toggleDark = () => setDarkMode(d => { localStorage.setItem('pd_dark', d ? '0' : '1'); return !d })
  const A = darkMode
    ? { panel: '#0a0a0a', chatBg: 'rgba(4,4,4,0.96)', border: 'rgba(255,255,255,0.05)', text: '#e0e0e0', textDim: '#999', textFaint: '#444', inputBg: '#0d0d0d', inputBorder: 'rgba(255,255,255,0.07)', selectColor: '#ccc' }
    : { panel: '#ffffff', chatBg: 'rgba(248,248,250,0.97)', border: 'rgba(0,0,0,0.08)', text: '#111111', textDim: '#555', textFaint: '#999', inputBg: '#f5f5f7', inputBorder: 'rgba(0,0,0,0.1)', selectColor: '#333' }

  const mat = MATERIALS[material] || MATERIALS.PLA
  const estWeightG = params.grid_x * params.grid_y * params.height_u * 3.5
  const estCost = (estWeightG * mat.costPerGram * qty).toFixed(2)
  const estTime = Math.round(params.grid_x * params.grid_y * params.height_u * 10)

  useEffect(() => {
    const worker = new Worker(new URL('./occWorker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(window.innerWidth - 500, window.innerHeight)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x080808)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, (window.innerWidth - 500) / window.innerHeight, 0.1, 1000)
    camera.position.set(80, -80, 60)

    const controls = new OrbitControls(camera, canvasRef.current)
    controls.target.set(21, 21, 10)
    camera.lookAt(21, 21, 10)

    const grid = new THREE.GridHelper(200, 20, 0x1a1a1a, 0x111111)
    grid.rotation.x = Math.PI / 2
    grid.position.set(50, 50, 0)
    scene.add(grid)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(100, 100, 100)
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3)
    fillLight.position.set(-50, -50, 50)
    scene.add(fillLight)

    worker.onmessage = (e) => {
      const data = e.data
      if (data.status === 'error') { setStatus('error: ' + data.message); return }
      setStatus(data.status)
      if (data.status === 'mesh') {
        vertsRef.current = data.verts
        if (meshRef.current) {
          sceneRef.current.remove(meshRef.current)
          meshRef.current.geometry.dispose()
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(data.verts, 3))
        geometry.computeVertexNormals()
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0x00cc66, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.05
        }))
        sceneRef.current.add(mesh)
        meshRef.current = mesh
      }
    }
    worker.onerror = (e) => setStatus('worker error: ' + e.message)

    function animate() {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => { worker.terminate(); renderer.dispose() }
  }, [])

  const buildWithParams = useCallback((p) => {
    if (workerRef.current) workerRef.current.postMessage({ type: 'build', ...p })
  }, [])

  const buildVase = useCallback((p) => {
    if (workerRef.current) workerRef.current.postMessage({ type: 'vase', ...p })
  }, [])

  const handleChange = (key, value) => {
    const newParams = { ...params, [key]: value }
    setParams(newParams)
    const newEntry = { ...newParams, ts: Date.now(), msg: '' }
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIdx + 1)
      const next = [...trimmed, newEntry]
      setHistoryIdx(next.length - 1)
      return next
    })
    buildWithParams(newParams)
  }

  const handleVaseChange = (key, value) => {
    const newParams = { ...vaseParams, [key]: value }
    setVaseParams(newParams)
    buildVase(newParams)
  }

  const handleScrub = (idx) => {
    setHistoryIdx(idx)
    const snap = history[idx]
    setParams(snap)
    buildWithParams(snap)
  }

  const handleModeSwitch = (newMode) => {
    setMode(newMode)
    if (newMode === 'gridfinity') buildWithParams(params)
    else if (newMode === 'vase') buildVase(vaseParams)
  }

  const exportSTL = () => {
    if (!vertsRef.current) return
    const buf = buildBinarySTL(vertsRef.current)
    const blob = new Blob([buf], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = mode === 'vase'
      ? `vase_r${vaseParams.base_r}_h${vaseParams.height}.stl`
      : `gridfinity_${params.grid_x}x${params.grid_y}x${params.height_u}.stl`
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const sendToFarm = async () => {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const N8N = import.meta.env.VITE_N8N_URL
    setFarmLoading(true)
    setFarmResponse(null)
    setStatus('sending...')
    try {
      const spec_id = `gridfinity-${params.grid_x}x${params.grid_y}x${params.height_u}`
      const claimed_time = params.grid_x * params.grid_y * params.height_u * 600
      const claimed_weight = estWeightG

      if (N8N) {
        const formData = new FormData()
        const fileRes = await fetch('/sliced_output.3mf')
        const blob = await fileRes.blob()
        formData.append('data', blob, 'design.3mf')
        formData.append('spec_id', spec_id)
        formData.append('spec_version', 'v0')
        formData.append('material', material)
        formData.append('qty', String(qty))
        formData.append('machine_class', 'BambuA1')
        formData.append('claimed_time_seconds', String(claimed_time))
        formData.append('claimed_weight_grams', String(claimed_weight))
        const res = await fetch(N8N + '/webhook/farm-intake', { method: 'POST', body: formData })
        const data = await res.json()
        setFarmResponse(data)
        setStatus(data.flagged_for_review ? '⚠ flagged' : '✓ sent')
      } else {
        const res = await fetch(`${API}/api/v1/slicer/slice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material, machine: 'BambuA1', claimed_time_seconds: claimed_time, claimed_weight_grams: claimed_weight })
        })
        const data = await res.json()
        setFarmResponse(data)
        setStatus(data.error ? 'slice error' : data.flagged_for_review ? '⚠ flagged' : '✓ sent')
      }
    } catch (err) {
      setStatus('failed: ' + err.message)
      setFarmResponse({ error: err.message })
    }
    setFarmLoading(false)
  }

  const gridSliders = [
    { key: 'grid_x', label: 'Grid X', min: 1, max: 5, step: 1 },
    { key: 'grid_y', label: 'Grid Y', min: 1, max: 5, step: 1 },
    { key: 'height_u', label: 'Height Units', min: 1, max: 8, step: 1 },
    { key: 'wall', label: 'Wall (mm)', min: 1.2, max: 3.0, step: 0.1 },
  ]

  const vaseSliders = [
    { key: 'base_r', label: 'Base Radius', min: 10, max: 50, step: 1 },
    { key: 'amplitude', label: 'Amplitude', min: 0, max: 20, step: 1 },
    { key: 'frequency', label: 'Frequency', min: 1, max: 10, step: 1 },
    { key: 'height', label: 'Height (mm)', min: 30, max: 150, step: 5 },
  ]

  const sendChat = async () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ message: userMsg, params, pendingAction: pendingActionRef.current })
      })
      const text = await res.text()
      const data = JSON.parse(text.startsWith('=') ? text.slice(1) : text)
      if (data.type === 'set_param' && data.changes) {
        setParams(prev => {
          const newParams = { ...prev, ...data.changes }
          buildWithParams(newParams)
          setHistory(h => {
            const trimmed = h.slice(0, historyIdx + 1)
            const next = [...trimmed, { ...newParams, ts: Date.now(), msg: userMsg }]
            setHistoryIdx(next.length - 1)
            return next
          })
          return newParams
        })
        setPendingAction(null)
        pendingActionRef.current = null
      } else if (data.type === 'ask_user' && data.askUser) {
        setPendingAction(data.askUser.pendingAction)
        pendingActionRef.current = data.askUser.pendingAction
      } else if (data.type === 'add_feature') {
        setPendingAction(null)
        pendingActionRef.current = null
        if (data.features && data.features.length > 0) {
          data.features.forEach(feat => {
            workerRef.current.postMessage({ type: 'feature', feature: feat })
          })
        }
      } else {
        setPendingAction(null)
        pendingActionRef.current = null
      }
      setChatMessages(prev => [...prev, { role: 'ai', content: data.message }])
    } catch(e) {
      setChatMessages(prev => [...prev, { role: 'ai', content: 'Error: ' + e.message }])
    }
    setChatLoading(false)
  }

  const isOk = !status.includes('error') && !status.includes('failed')

  return (
    <AppThemeCtx.Provider value={darkMode}>
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", background: darkMode ? '#080808' : '#f5f5f7' }}>
      <style>{`
        input[type=range] { height: 3px; cursor: pointer }
        select { outline: none }
        button { outline: none }
        * { box-sizing: border-box }
      `}</style>

      {mode === 'farm' && (
        <div style={{ position: 'absolute', left: 240, right: 0, top: 0, bottom: 0, zIndex: 5, overflowY: 'auto' }}>
          <Dashboard darkMode={darkMode} />
        </div>
      )}

      <canvas ref={canvasRef} style={{
        position: 'absolute', left: 240, right: 260, top: 0, bottom: 0,
        width: 'calc(100vw - 500px)', height: '100vh',
        display: mode === 'farm' ? 'none' : 'block'
      }} />

      {/* Left panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%', width: 240,
        background: A.panel, padding: '18px 14px',
        color: A.text, overflowY: 'auto',
        borderRight: `1px solid ${A.border}`
      }}>
        {/* Branding + theme toggle */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#00cc66', letterSpacing: '-0.01em' }}>MAKER AI</div>
            <button onClick={toggleDark} title={darkMode ? 'Light mode' : 'Dark mode'} style={{
              background: darkMode ? '#1a1a1a' : '#f0f0f0', border: `1px solid ${A.border}`,
              borderRadius: 20, padding: '3px 8px', cursor: 'pointer', fontSize: 12, lineHeight: 1,
              color: A.text, transition: 'all 0.2s'
            }}>{darkMode ? '☀' : '🌙'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: isOk ? '#00cc66' : '#ff4444' }} />
            <span style={{ fontSize: 9, color: A.textDim, fontFamily: 'monospace' }}>{status}</span>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          <ModeTab id="gridfinity" label="Grid" icon="⬡" active={mode === 'gridfinity'} onClick={handleModeSwitch} />
          <ModeTab id="vase" label="Vase" icon="⌀" active={mode === 'vase'} onClick={handleModeSwitch} />
          <ModeTab id="farm" label="Farm" icon="⚙" active={mode === 'farm'} onClick={handleModeSwitch} />
        </div>

        {mode === 'gridfinity' && (
          <>
            {/* Divider */}
            <div style={{ fontSize: 8, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Dimensions</div>

            {gridSliders.map(({ key, label, min, max, step }) => (
              <Slider key={key} label={label} value={params[key]} min={min} max={max} step={step}
                onChange={v => handleChange(key, v)} />
            ))}

            {/* Size readout */}
            <div style={{
              background: A.inputBg, border: `1px solid ${A.border}`,
              borderRadius: 6, padding: '8px 10px', marginBottom: 14, fontFamily: 'monospace'
            }}>
              <div style={{ fontSize: 9, color: A.textDim, marginBottom: 4 }}>SIZE</div>
              <div style={{ fontSize: 11, color: A.textDim }}>
                {params.grid_x * 42} × {params.grid_y * 42} × {params.height_u * 7} mm
              </div>
            </div>

            {/* Material */}
            <div style={{ fontSize: 8, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Material &amp; Order</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Material</div>
              <select value={material} onChange={e => setMaterial(e.target.value)} style={{
                width: '100%', background: A.inputBg, border: `1px solid ${A.inputBorder}`,
                color: MATERIALS[material].color, padding: '7px 10px', borderRadius: 5, fontSize: 11,
                fontFamily: 'monospace', cursor: 'pointer'
              }}>
                {Object.entries(MATERIALS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} — ${v.costPerGram.toFixed(3)}/g</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Quantity</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{
                  width: 28, height: 28, background: A.inputBg, border: `1px solid ${A.border}`,
                  color: A.textDim, cursor: 'pointer', borderRadius: 4, fontSize: 14
                }}>−</button>
                <input type="number" min={1} max={99} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    flex: 1, background: A.inputBg, border: `1px solid ${A.inputBorder}`,
                    color: A.text, padding: '5px 8px', borderRadius: 4, fontSize: 13,
                    fontFamily: 'monospace', textAlign: 'center'
                  }} />
                <button onClick={() => setQty(q => Math.min(99, q + 1))} style={{
                  width: 28, height: 28, background: A.inputBg, border: `1px solid ${A.border}`,
                  color: A.textDim, cursor: 'pointer', borderRadius: 4, fontSize: 14
                }}>+</button>
              </div>
            </div>

            {/* Cost estimate */}
            <div style={{
              background: 'rgba(0,204,102,0.04)', border: '1px solid rgba(0,204,102,0.12)',
              borderRadius: 6, padding: '10px', marginBottom: 14
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['~Weight', `${Math.round(estWeightG * qty)}g`],
                  ['~Time', `${estTime}min`],
                  ['~Cost', `$${estCost}`],
                  ['Material', material],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 8, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
                    <div style={{ fontSize: 11, color: A.textDim, fontFamily: 'monospace', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <button onClick={sendToFarm} disabled={farmLoading} style={{
              width: '100%', padding: '10px', borderRadius: 6, marginBottom: 8,
              background: farmLoading ? A.inputBg : '#00cc66',
              color: farmLoading ? A.textDim : '#000',
              border: farmLoading ? `1px solid ${A.border}` : 'none',
              fontWeight: 700, fontSize: 11, cursor: farmLoading ? 'default' : 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.2s'
            }}>
              {farmLoading ? '⏳ Sending...' : `⬆ Send to Farm${qty > 1 ? ` ×${qty}` : ''}`}
            </button>

            <button onClick={exportSTL} disabled={!vertsRef.current} style={{
              width: '100%', padding: '8px', borderRadius: 6, marginBottom: 14,
              background: 'transparent', color: vertsRef.current ? A.textDim : A.textFaint,
              border: `1px solid ${A.border}`,
              fontWeight: 500, fontSize: 10, cursor: vertsRef.current ? 'pointer' : 'default',
              letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.2s'
            }}>↓ Export STL</button>

            {farmResponse && (
              <div style={{
                background: farmResponse.error ? 'rgba(255,68,68,0.05)' : farmResponse.flagged_for_review ? 'rgba(255,152,0,0.05)' : 'rgba(0,204,102,0.05)',
                border: `1px solid ${farmResponse.error ? '#ff444422' : farmResponse.flagged_for_review ? '#ff980022' : '#00cc6622'}`,
                borderRadius: 6, padding: '10px', fontSize: 10, fontFamily: 'monospace'
              }}>
                {farmResponse.error
                  ? <div style={{ color: '#ff4444' }}>{farmResponse.error}</div>
                  : <>
                    <div style={{ color: farmResponse.flagged_for_review ? '#ff9800' : '#00cc66', fontWeight: 700, marginBottom: 6 }}>
                      {farmResponse.flagged_for_review ? '⚠ FLAGGED FOR REVIEW' : '✓ ACCEPTED'}
                    </div>
                    <div style={{ color: A.textDim, lineHeight: 1.8 }}>
                      {farmResponse.actual_time_seconds != null && <div>time: {Math.round(farmResponse.actual_time_seconds / 60)}min</div>}
                      {farmResponse.actual_weight_grams != null && <div>weight: {farmResponse.actual_weight_grams}g</div>}
                    </div>
                  </>
                }
              </div>
            )}
          </>
        )}

        {mode === 'vase' && (
          <>
            <div style={{ fontSize: 8, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Vase Parameters</div>
            {vaseSliders.map(({ key, label, min, max, step }) => (
              <Slider key={key} label={label} value={vaseParams[key]} min={min} max={max} step={step}
                onChange={v => handleVaseChange(key, v)} accent="#aa44ff" />
            ))}
            <div style={{
              background: A.inputBg, border: `1px solid ${A.border}`,
              borderRadius: 6, padding: '8px 10px', marginBottom: 14, fontFamily: 'monospace', fontSize: 10, color: A.textDim
            }}>
              r(θ) = {vaseParams.base_r} + {vaseParams.amplitude}·sin({vaseParams.frequency}θ)
            </div>
            <button onClick={exportSTL} disabled={!vertsRef.current} style={{
              width: '100%', padding: '9px', borderRadius: 6,
              background: 'transparent', color: vertsRef.current ? '#aa44ff' : A.textFaint,
              border: `1px solid ${vertsRef.current ? '#aa44ff44' : A.border}`,
              fontWeight: 600, fontSize: 10, cursor: vertsRef.current ? 'pointer' : 'default',
              letterSpacing: '0.08em', textTransform: 'uppercase'
            }}>↓ Export STL</button>
          </>
        )}
      </div>

      {/* History scrubber */}
      {mode === 'gridfinity' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 240, right: 260,
          background: darkMode ? 'rgba(0,0,0,0.75)' : 'rgba(245,245,247,0.92)', backdropFilter: 'blur(8px)',
          padding: '10px 20px', color: A.text, fontFamily: 'monospace',
          borderTop: `1px solid ${A.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: A.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              History {historyIdx + 1}/{history.length}
            </span>
            <input type="range" min={0} max={history.length - 1} step={1} value={historyIdx}
              onChange={e => handleScrub(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: '#00cc66' }} />
          </div>
          <div style={{ fontSize: 9, color: A.textFaint }}>
            {history[historyIdx] && (
              <>
                <span style={{ color: A.textDim }}>
                  {history[historyIdx].grid_x}×{history[historyIdx].grid_y} | h:{history[historyIdx].height_u} | wall:{history[historyIdx].wall}mm
                </span>
                {history[historyIdx].msg && (
                  <span style={{ color: '#00cc6644', marginLeft: 10 }}>"{history[historyIdx].msg}"</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Chat panel */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 260, height: '100%',
        background: A.chatBg, display: mode === 'farm' ? 'none' : 'flex',
        flexDirection: 'column', fontFamily: 'monospace', color: A.text, zIndex: 10,
        borderLeft: `1px solid ${A.border}`
      }}>
        <div style={{ padding: '16px 14px', borderBottom: `1px solid ${A.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#00cc66', letterSpacing: '0.15em', textTransform: 'uppercase' }}>AI Assistant</div>
          <div style={{ fontSize: 9, color: A.textFaint, marginTop: 3 }}>natural language → geometry</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {chatMessages.length === 0 && (
            <div style={{ color: A.textFaint, fontSize: 10, lineHeight: 2 }}>
              {['make it 3 units wide', 'make it 2 deep', 'set height to 5', 'wall 2.0'].map(s => (
                <div key={s} style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3 }}
                  onClick={() => { setChatInput(s) }}
                >&rsaquo; {s}</div>
              ))}
            </div>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <span style={{
                background: m.role === 'user' ? '#00cc6618' : A.inputBg,
                color: m.role === 'user' ? '#00cc66' : A.textDim,
                border: `1px solid ${m.role === 'user' ? '#00cc6633' : A.border}`,
                padding: '6px 10px', borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                fontSize: 11, display: 'inline-block', maxWidth: '90%', lineHeight: 1.5
              }}>{m.content}</span>
            </div>
          ))}
          {chatLoading && (
            <div style={{ color: A.textFaint, fontSize: 10, fontStyle: 'italic' }}>thinking...</div>
          )}
          {pendingAction && !chatLoading && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => { setChatInput('yes'); setTimeout(sendChat, 50) }}
                style={{ flex: 1, background: '#00cc6618', color: '#00cc66', border: '1px solid #00cc6633', padding: 8, fontSize: 11, cursor: 'pointer', borderRadius: 4 }}>
                ✓ Yes
              </button>
              <button onClick={() => { setChatInput('no'); setTimeout(sendChat, 50) }}
                style={{ flex: 1, background: A.inputBg, color: A.textDim, border: `1px solid ${A.border}`, padding: 8, fontSize: 11, cursor: 'pointer', borderRadius: 4 }}>
                ✕ No
              </button>
            </div>
          )}
        </div>
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${A.border}`, display: 'flex', gap: 6 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="describe your design..."
            style={{
              flex: 1, background: A.inputBg, border: `1px solid ${A.inputBorder}`,
              color: A.text, padding: '8px 10px', fontSize: 11, borderRadius: 5
            }}
          />
          <button onClick={sendChat} style={{
            background: '#00cc66', color: '#000', border: 'none',
            padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12, borderRadius: 5
          }}>↑</button>
        </div>
      </div>
    </div>
  )
}

export default App
