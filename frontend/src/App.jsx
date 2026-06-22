import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const DEFAULT_PARAMS = { grid_x: 1, grid_y: 1, height_u: 3, wall: 1.2 }
const DEFAULT_VASE = { base_r: 20, amplitude: 8, frequency: 4, height: 80 }

function App() {
  const [status, setStatus] = useState('starting...')
  const [mode, setMode] = useState('gridfinity')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [vaseParams, setVaseParams] = useState(DEFAULT_VASE)
  const [history, setHistory] = useState([{ ...DEFAULT_PARAMS, ts: Date.now(), msg: 'initial' }])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [farmResponse, setFarmResponse] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const pendingActionRef = useRef(null)

  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const meshRef = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    const worker = new Worker(new URL('./occWorker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(window.innerWidth - 480, window.innerHeight)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0d0d)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, (window.innerWidth - 480) / window.innerHeight, 0.1, 1000)
    camera.position.set(80, -80, 60)

    const controls = new OrbitControls(camera, canvasRef.current)
    controls.target.set(21, 21, 10)
    camera.lookAt(21, 21, 10)

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(100, 100, 100)
    scene.add(dirLight)

    worker.onmessage = (e) => {
      const data = e.data
      if (data.status === 'error') { setStatus('ERROR: ' + data.message); return }
      setStatus(data.status)
      if (data.status === 'mesh') {
        if (meshRef.current) {
          sceneRef.current.remove(meshRef.current)
          meshRef.current.geometry.dispose()
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(data.verts, 3))
        geometry.computeVertexNormals()
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x00cc66, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1 }))
        sceneRef.current.add(mesh)
        meshRef.current = mesh
      }
    }
    worker.onerror = (e) => setStatus('Worker error: ' + e.message)

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
    else buildVase(vaseParams)
  }

  const sendToFarm = async () => {
    setStatus('sending...')
    setFarmResponse(null)
    try {
      const spec_id = `gridfinity-${params.grid_x}x${params.grid_y}x${params.height_u}`
      const claimed_time = params.grid_x * params.grid_y * params.height_u * 600
      const claimed_weight = params.grid_x * params.grid_y * params.height_u * 3.5
      const formData = new FormData()
      const fileRes = await fetch('/sliced_output.3mf')
      const blob = await fileRes.blob()
      formData.append('data', blob, 'design.3mf')
      formData.append('spec_id', spec_id)
      formData.append('spec_version', 'v0')
      formData.append('material', 'PLA')
      formData.append('qty', '1')
      formData.append('machine_class', 'BambuA1')
      formData.append('claimed_time_seconds', String(claimed_time))
      formData.append('claimed_weight_grams', String(claimed_weight))
      const res = await fetch((import.meta.env.VITE_N8N_URL || 'http://localhost:5678') + '/webhook/farm-intake', { method: 'POST', body: formData })
      const data = await res.json()
      setFarmResponse(data)
      setStatus(data.flagged_for_review ? '⚠️ flagged!' : '✅ sent!')
    } catch (err) {
      setStatus('Send failed: ' + err.message)
    }
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', left: '220px', right: '260px', top: 0, bottom: 0, width: 'calc(100vw - 480px)', height: '100vh', display: 'block' }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%',
        width: '220px', background: 'rgba(10,10,10,0.92)',
        padding: '20px 16px', boxSizing: 'border-box', color: 'white',
        fontFamily: "'Inter', sans-serif", overflowY: 'auto',
        borderRight: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#00ff88', letterSpacing: '0.15em' }}>MAKER AI</div>
        <div style={{ marginBottom: '20px', fontSize: '10px', color: '#444', letterSpacing: '0.05em' }}>PARAMETRIC 3D DESIGN</div>
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.includes('ERROR') ? '#ff4444' : '#00ff88', display: 'inline-block' }}></span>
          <span style={{ fontSize: '10px', color: '#666', fontFamily: "'JetBrains Mono', monospace" }}>{status}</span>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {['gridfinity', 'vase'].map(m => (
            <button key={m} onClick={() => handleModeSwitch(m)} style={{
              flex: 1, padding: '7px 4px', fontSize: '10px', cursor: 'pointer',
              background: mode === m ? '#00ff88' : 'transparent',
              color: mode === m ? '#000' : '#555',
              border: mode === m ? 'none' : '1px solid #222',
              fontFamily: "'Inter', sans-serif", fontWeight: 500,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              transition: 'all 0.15s'
            }}>{m}</button>
          ))}
        </div>

        {mode === 'gridfinity' && <>
          {gridSliders.map(({ key, label, min, max, step }) => (
            <div key={key} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ color: '#00ff88', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>{params[key]}</span>
              </div>
              <input type="range" min={min} max={max} step={step}
                value={params[key]}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                style={{ width: '100%' }} />
            </div>
          ))}
          <div style={{ fontSize: '11px', color: '#666' }}>
            {params.grid_x}×{params.grid_y} | {params.grid_x * 42}×{params.grid_y * 42}×{params.height_u * 7}mm
          </div>
          <button onClick={sendToFarm} style={{
            marginTop: '16px', width: '100%', padding: '10px',
            background: '#00ff88', color: '#000', border: 'none',
            fontFamily: "'Inter', sans-serif", fontSize: '11px', cursor: 'pointer',
            fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            transition: 'opacity 0.15s'
          }}>⬆ Send to Farm</button>
          {farmResponse && (
            <div style={{ marginTop: '10px', fontSize: '10px', color: '#aaa', lineHeight: '1.6' }}>
              <div style={{ color: farmResponse.flagged_for_review ? '#ff9800' : '#4caf50' }}>
                {farmResponse.flagged_for_review ? '⚠️ FLAGGED' : '✅ PASS'}
              </div>
              <div>time: {farmResponse.actual_time_seconds}s</div>
              <div>weight: {farmResponse.actual_weight_grams}g</div>
            </div>
          )}
        </>}

        {mode === 'vase' && <>
          {vaseSliders.map(({ key, label, min, max, step }) => (
            <div key={key} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                {label}: <span style={{ color: '#4caf50' }}>{vaseParams[key]}</span>
              </div>
              <input type="range" min={min} max={max} step={step}
                value={vaseParams[key]}
                onChange={(e) => handleVaseChange(key, parseFloat(e.target.value))}
                style={{ width: '100%' }} />
            </div>
          ))}
          <div style={{ fontSize: '11px', color: '#666' }}>
            r(θ) = {vaseParams.base_r} + {vaseParams.amplitude}·sin({vaseParams.frequency}θ)
          </div>
        </>}
      </div>

      {mode === 'gridfinity' && (
        <div style={{
          position: 'absolute', bottom: 0, left: '220px', right: '260px',
          background: 'rgba(0,0,0,0.75)', padding: '12px 20px',
          color: 'white', fontFamily: 'monospace'
        }}>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px' }}>
            Spec History — commit {historyIdx + 1} / {history.length}
          </div>
          <input type="range" min={0} max={history.length - 1} step={1}
            value={historyIdx}
            onChange={(e) => handleScrub(parseInt(e.target.value))}
            style={{ width: '100%' }} />
          <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
            {history[historyIdx] && <><span style={{color:'#aaa'}}>{history[historyIdx].grid_x}×{history[historyIdx].grid_y} | h:{history[historyIdx].height_u} | wall:{history[historyIdx].wall}mm</span>{history[historyIdx].msg && <span style={{color:'#4caf50',marginLeft:'8px',fontSize:'10px'}}>"{history[historyIdx].msg}"</span>}</>}
          </div>
        </div>
      )}

      {/* Chat Panel */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '260px', height: '100%', background: 'rgba(0,0,0,0.80)', display: 'flex', flexDirection: 'column', fontFamily: 'monospace', color: 'white', zIndex: 10 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#00ff88', letterSpacing: '0.15em' }}>AI ASSISTANT</div>
          <div style={{ fontSize: '10px', color: '#333', marginTop: '2px' }}>natural language → geometry</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {chatMessages.length === 0 && (
            <div style={{ color: '#555', fontSize: '11px', lineHeight: '1.8' }}>
              Try:<br/>
              "make it 3 units wide"<br/>
              "make it 2 deep"<br/>
              "set height to 5"<br/>
              "wall 2.0"
            </div>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} style={{ marginBottom: '10px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <span style={{
                background: m.role === 'user' ? '#4caf50' : '#333',
                color: m.role === 'user' ? 'black' : 'white',
                padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                display: 'inline-block', maxWidth: '90%'
              }}>{m.content}</span>
            </div>
          ))}
          {chatLoading && <div style={{ color: '#aaa', fontSize: '12px' }}>thinking...</div>}
          {pendingAction && !chatLoading && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => { setChatInput('yes'); setTimeout(sendChat, 50) }}
                style={{ flex: 1, background: '#4caf50', color: 'black', border: 'none', padding: '8px', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' }}>
                ✅ Confirm
              </button>
              <button onClick={() => { setChatInput('no'); setTimeout(sendChat, 50) }}
                style={{ flex: 1, background: '#333', color: 'white', border: '1px solid #555', padding: '8px', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' }}>
                ❌ Cancel
              </button>
            </div>
          )}
        </div>
        <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', gap: '8px' }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder='Ask AI...'
            style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}
          />
          <button onClick={sendChat} style={{ background: '#00ff88', color: '#000', border: 'none', padding: '8px 14px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px' }}>↑</button>
        </div>
      </div>
    </div>
  )
}

export default App