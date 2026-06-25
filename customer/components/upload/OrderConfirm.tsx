'use client'

import { useState } from 'react'
import { api, type PriceResponse } from '@/lib/api'
import { Loader2, ShoppingCart } from 'lucide-react'

interface Props {
  file: File | null
  material: string
  quote: PriceResponse | null
  onSuccess: (orderId: string) => void
}

export default function OrderConfirm({ file, material, quote, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !quote) return
    setLoading(true)
    setError(null)

    try {
      // Create a Shopify draft order with the exact quoted price
      const res = await api.createShopifyCheckout({
        customer_name: name,
        customer_email: email,
        customer_phone: phone || undefined,
        material,
        weight_g: quote.weight_g,
        print_time_min: quote.print_time_min,
        quote_total: quote.total,
        file_name: file?.name,
        notes: notes || undefined,
      })

      // Notify parent (shows success screen) then redirect to Shopify checkout
      onSuccess(res.draft_order_id)
      window.location.href = res.invoice_url
    } catch (err) {
      // Fallback: if backend Shopify isn't configured, create order directly
      try {
        const fallback = await api.createOrder({
          customer_name: name,
          customer_email: email,
          customer_phone: phone || undefined,
          material,
          weight_g: quote?.weight_g,
          print_time_min: quote?.print_time_min,
          quote_total: quote?.total,
          notes: notes || undefined,
          file_name: file?.name,
        })
        onSuccess(fallback.id)
      } catch {
        setError(err instanceof Error ? err.message : 'Order failed — please try again')
        setLoading(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      {quote && (
        <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: '#00cc6630', background: '#00cc6608' }}>
          <div>
            <p className="text-sm text-gray-500">Quote total</p>
            <p className="text-2xl font-black" style={{ color: '#00cc66' }}>₹{quote.total.toFixed(0)}</p>
          </div>
          <div className="text-sm text-right text-gray-400">
            <p>{material} · {quote.weight_g}g</p>
            <p>{quote.print_time_min.toFixed(0)} min print</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
        <ShoppingCart size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          You'll be redirected to <strong>store.fofus.in</strong> to complete payment securely via Shopify. We accept UPI, cards, and net banking.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">Full name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rahul Kumar"
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Email *</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rahul@example.com"
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5">Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Colour preference, delivery notes, special requirements..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66] resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !quote}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-black disabled:opacity-60 transition-opacity hover:opacity-90"
          style={{ background: '#00cc66' }}
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Creating order...</>
          ) : (
            <><ShoppingCart size={16} /> Pay ₹{quote?.total.toFixed(0) ?? '—'} on Shopify</>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          Redirects to store.fofus.in · Secured by Shopify
        </p>
      </form>
    </div>
  )
}
