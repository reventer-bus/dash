'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import FileDropzone from './FileDropzone'
import MaterialSelector from './MaterialSelector'
import QuoteDisplay from './QuoteDisplay'
import OrderConfirm from './OrderConfirm'
import type { PriceResponse } from '@/lib/api'

const STEPS = [
  { id: 'file', label: 'File' },
  { id: 'material', label: 'Material' },
  { id: 'quote', label: 'Quote' },
  { id: 'order', label: 'Order' },
]

function estimateFromFile(file: File): { weightG: number | null; printTimeMin: number | null } {
  const mb = file.size / 1024 / 1024
  if (file.name.match(/\.(stl|obj|3mf|step|stp)$/i)) {
    const weightG = Math.max(5, mb * 8)
    const printTimeMin = Math.max(10, weightG * 2.5)
    return { weightG: parseFloat(weightG.toFixed(1)), printTimeMin: parseFloat(printTimeMin.toFixed(0)) }
  }
  return { weightG: null, printTimeMin: null }
}

export default function UploadStepper() {
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [material, setMaterial] = useState('PLA')
  const [layerHeight, setLayerHeight] = useState('0.20')
  const [infill, setInfill] = useState(15)
  const [quote, setQuote] = useState<PriceResponse | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)

  const { weightG, printTimeMin } = file ? estimateFromFile(file) : { weightG: null, printTimeMin: null }

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setStep(1)
  }, [])

  const handleMaterialChange = useCallback((vals: { material?: string; layerHeight?: string; infill?: number }) => {
    if (vals.material !== undefined) setMaterial(vals.material)
    if (vals.layerHeight !== undefined) setLayerHeight(vals.layerHeight)
    if (vals.infill !== undefined) setInfill(vals.infill)
  }, [])

  const handleQuote = useCallback((q: PriceResponse) => {
    setQuote(q)
  }, [])

  const handleOrderSuccess = useCallback((id: string) => {
    setOrderId(id)
    setStep(3)
  }, [])

  if (orderId) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 px-4">
        <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: '#00cc6612' }}>
          <CheckCircle2 size={40} style={{ color: '#00cc66' }} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Order placed!</h2>
        <p className="text-gray-500 mb-4">Your order ID is <span className="font-mono font-semibold text-black">{orderId}</span></p>
        <p className="text-sm text-gray-400 mb-8">We'll send a confirmation email. Our nearest franchise partner will begin printing within 24 hours.</p>
        <button
          onClick={() => { setFile(null); setStep(0); setOrderId(null); setQuote(null) }}
          className="text-sm font-semibold px-6 py-3 rounded-xl border border-black/10 hover:bg-gray-50 transition-colors"
        >
          Start another order
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-10">
        {STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          return (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => i <= step && setStep(i)}
                className="flex items-center gap-2 py-1 group"
                disabled={i > step}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={{
                    background: done ? '#00cc66' : active ? '#00cc6620' : 'rgba(0,0,0,0.06)',
                    color: done ? 'black' : active ? '#00cc66' : '#999',
                  }}
                >
                  {done ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-black' : done ? 'text-gray-600' : 'text-gray-300'}`}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight size={14} className="text-gray-200 flex-shrink-0 ml-1" />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-3xl border border-black/[0.06] p-8">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold mb-1">Upload your design</h2>
            <p className="text-sm text-gray-400 mb-6">STL, OBJ, 3MF, STEP, PDF, or an image of your sketch</p>
            <FileDropzone file={file} onFile={handleFile} />
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-1">Choose material</h2>
            <p className="text-sm text-gray-400 mb-6">Pick the right filament for your use case</p>
            <MaterialSelector
              material={material}
              layerHeight={layerHeight}
              infill={infill}
              onChange={handleMaterialChange}
            />
            <button
              onClick={() => setStep(2)}
              className="mt-8 w-full py-3.5 rounded-xl font-semibold text-black"
              style={{ background: '#00cc66' }}
            >
              Get Quote →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold mb-1">Your quote</h2>
            <p className="text-sm text-gray-400 mb-6">Based on {material}, {layerHeight}mm layers, {infill}% infill</p>
            <QuoteDisplay
              material={material}
              weightG={weightG}
              printTimeMin={printTimeMin}
              onQuote={handleQuote}
            />
            {quote && (
              <button
                onClick={() => setStep(3)}
                className="mt-6 w-full py-3.5 rounded-xl font-semibold text-black"
                style={{ background: '#00cc66' }}
              >
                Place Order →
              </button>
            )}
            {!weightG && (
              <p className="mt-4 text-xs text-gray-400 text-center">
                Estimates require an STL/OBJ/3MF file. For images, a partner will review and quote manually.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold mb-1">Confirm your order</h2>
            <p className="text-sm text-gray-400 mb-6">Your details — we'll send a confirmation email</p>
            <OrderConfirm
              file={file}
              material={material}
              quote={quote}
              onSuccess={handleOrderSuccess}
            />
          </div>
        )}
      </div>

      {/* Back link */}
      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          className="mt-4 text-sm text-gray-400 hover:text-black transition-colors mx-auto block"
        >
          ← Back
        </button>
      )}
    </div>
  )
}
