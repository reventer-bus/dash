'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, PackageSearch } from 'lucide-react'

export default function TrackLookupPage() {
  const [ref, setRef] = useState('')
  const router = useRouter()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = ref.trim().replace(/^#/, '')
    if (cleaned) router.push(`/track/${encodeURIComponent(cleaned)}`)
  }

  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="text-center mb-8">
          <PackageSearch size={40} className="mx-auto mb-4 text-fofus-green" />
          <h1 className="text-3xl font-bold mb-2">Track your order</h1>
          <p className="text-gray-500 text-sm">
            Enter the order number from your confirmation email or WhatsApp message.
          </p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Order number
          </label>
          <input
            value={ref}
            onChange={e => setRef(e.target.value)}
            placeholder="#1001"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-fofus-green"
          />
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-black"
            style={{ background: '#00cc66' }}
          >
            <Search size={15} /> Track order
          </button>
        </form>
      </div>
    </div>
  )
}
