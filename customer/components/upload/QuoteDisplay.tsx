'use client'

import { useEffect, useState } from 'react'
import { api, type PriceResponse } from '@/lib/api'
import { Loader2, AlertCircle } from 'lucide-react'

interface Props {
  material: string
  weightG: number | null
  printTimeMin: number | null
  machine?: string
  onQuote: (q: PriceResponse) => void
}

export default function QuoteDisplay({ material, weightG, printTimeMin, machine = 'BambuA1', onQuote }: Props) {
  const [quote, setQuote] = useState<PriceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!weightG || !printTimeMin) return
    let cancelled = false

    const fetch = async () => {
      setLoading(true)
      setError(null)
      try {
        const q = await api.getQuote({ material, weight_g: weightG, print_time_min: printTimeMin, machine })
        if (!cancelled) {
          setQuote(q)
          onQuote(q)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to get quote')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [material, weightG, printTimeMin, machine, onQuote])

  if (!weightG || !printTimeMin) {
    return (
      <div className="p-8 rounded-2xl border border-black/[0.06] bg-gray-50 text-center">
        <p className="text-gray-400 text-sm">Upload a file first to get your quote</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 rounded-2xl border border-black/[0.06] bg-white text-center">
        <Loader2 className="animate-spin mx-auto mb-3 text-[#00cc66]" size={24} />
        <p className="text-gray-400 text-sm">Calculating your quote...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-red-100 bg-red-50 flex items-start gap-3">
        <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm text-red-700 mb-0.5">Could not fetch quote</p>
          <p className="text-xs text-red-500">{error}</p>
          <p className="text-xs text-gray-400 mt-2">An estimate: weight × ₹{material === 'PLA' ? '2.5' : '3.5'}/g + machine time</p>
        </div>
      </div>
    )
  }

  if (!quote) return null

  const rows = [
    { label: 'Material cost', value: quote.material_cost, sub: `${quote.weight_g}g × ₹${(quote.material_cost / quote.weight_g).toFixed(2)}/g` },
    { label: 'Machine time', value: quote.machine_cost, sub: `${quote.print_time_min.toFixed(0)} min` },
    { label: 'Service fee (15%)', value: quote.service_fee, sub: 'Platform fee' },
  ]

  return (
    <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
      <div className="p-6 border-b border-black/[0.04]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-gray-400">Your quote</p>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#00cc6612', color: '#00cc66' }}>
            {quote.source === 'gcode' ? 'From G-code' : 'Estimated'}
          </span>
        </div>
        <div className="text-4xl font-black tracking-tight" style={{ color: '#00cc66' }}>
          ₹{quote.total.toFixed(0)}
        </div>
        <p className="text-xs text-gray-400 mt-1">{quote.currency} · includes all fees</p>
      </div>

      <div className="divide-y divide-black/[0.04]">
        {rows.map(({ label, value, sub }) => (
          <div key={label} className="flex items-center justify-between px-6 py-3.5">
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-xs text-gray-400">{sub}</p>
            </div>
            <p className="font-semibold text-sm">₹{value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 bg-gray-50 text-xs text-gray-400">
        Final price may vary based on support structures and post-processing. Shipping extra.
      </div>
    </div>
  )
}
