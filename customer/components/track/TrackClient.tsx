'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Loader2, PackageX, Truck, MapPin } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://fofus.in'

interface PublicStatus {
  ok: boolean
  error?: string
  order_ref?: string
  status?: string
  status_label?: string
  stage_index?: number | null
  stages?: string[]
  cancelled?: boolean
  created_at?: string
  updated_at?: string
  timeline?: { stage: string; at: string | null }[]
  partner_name?: string | null
  tracking?: { code: string | null; url: string | null; company: string | null }
  photos?: string[]
}

function fmtDate(iso?: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function TrackClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<PublicStatus | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/v1/orders/${encodeURIComponent(orderId)}/public`)
        const body = await r.json()
        if (alive) { setData(body); setFailed(false) }
      } catch {
        if (alive) setFailed(true)
      }
    }
    load()
    const handle = setInterval(load, 30000) // poll — status changes mid-print day
    return () => { alive = false; clearInterval(handle) }
  }, [orderId])

  if (failed && !data) {
    return (
      <Shell>
        <p className="text-center text-gray-500 py-20">
          Could not reach the tracking service. Please try again in a moment.
        </p>
      </Shell>
    )
  }

  if (!data) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading order status…
        </div>
      </Shell>
    )
  }

  if (!data.ok) {
    return (
      <Shell>
        <div className="text-center py-16">
          <PackageX size={40} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-bold mb-2">Order not found</h2>
          <p className="text-gray-500 text-sm mb-6">
            We couldn&apos;t find <span className="font-mono">{orderId}</span>.
            Check the order number from your confirmation email.
          </p>
          <Link href="/track" className="text-sm font-semibold text-fofus-green">
            ← Try another order number
          </Link>
        </div>
      </Shell>
    )
  }

  const stageIdx = data.stage_index ?? -1
  const stages = data.stages ?? []

  return (
    <Shell>
      <div className="mb-8">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Order</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold font-mono">{data.order_ref}</h1>
          <span
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={data.cancelled
              ? { background: '#ff444420', color: '#cc2222' }
              : { background: '#00cc6620', color: '#00994d' }}
          >
            {data.status_label}
          </span>
        </div>
        {data.partner_name && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-2">
            <MapPin size={13} /> Printed by {data.partner_name}
          </div>
        )}
      </div>

      {/* Stage progress */}
      {!data.cancelled && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <ol className="space-y-0">
            {stages.map((label, i) => {
              const done = stageIdx >= 0 && i < stageIdx
              const current = i === stageIdx
              return (
                <li key={label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {done
                      ? <CheckCircle2 size={20} className="text-fofus-green flex-shrink-0" />
                      : current
                        ? <Loader2 size={20} className="text-fofus-green animate-spin flex-shrink-0" />
                        : <Circle size={20} className="text-gray-200 flex-shrink-0" />}
                    {i < stages.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[24px] ${done ? 'bg-fofus-green' : 'bg-gray-100'}`} />
                    )}
                  </div>
                  <div className={`pb-6 text-sm ${current ? 'font-bold text-gray-900' : done ? 'text-gray-700' : 'text-gray-400'}`}>
                    {label}
                    {current && data.updated_at && (
                      <div className="text-xs font-normal text-gray-400 mt-0.5">
                        since {fmtDate(data.updated_at)}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Courier tracking */}
      {data.tracking?.code && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm flex items-center gap-4">
          <Truck size={22} className="text-fofus-blue flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              {data.tracking.company || 'Courier'} tracking
            </div>
            <div className="font-mono text-sm">{data.tracking.code}</div>
          </div>
          {data.tracking.url && (
            <a
              href={data.tracking.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold px-4 py-2 rounded-xl text-black flex-shrink-0"
              style={{ background: '#00cc66' }}
            >
              Track parcel
            </a>
          )}
        </div>
      )}

      {/* Photos from the print farm */}
      {(data.photos?.length ?? 0) > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Photos from the print farm</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.photos!.map(p => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p}
                src={`${API}${p}`}
                alt="Order photo from the FOFUS print partner"
                className="rounded-xl border border-gray-200 w-full aspect-square object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {(data.timeline?.length ?? 0) > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3">History</h2>
          <ul className="space-y-2">
            {data.timeline!.slice().reverse().map((t, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{t.stage}</span>
                <span className="text-gray-400 text-xs">{fmtDate(t.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-8">
        Updates automatically · questions? <a className="underline" href="mailto:support@fofus.in">support@fofus.in</a>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-12">{children}</div>
    </div>
  )
}
