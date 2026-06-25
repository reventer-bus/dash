import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, FileText, ArrowRight } from 'lucide-react'

export default async function AccountPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-8">My Account</h1>

        <div className="grid sm:grid-cols-2 gap-5">
          <Link href="/account/orders" className="bg-white rounded-2xl border border-black/[0.06] p-6 group hover:border-[#00cc6630] transition-colors flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#00cc6612', color: '#00cc66' }}>
              <Package size={22} />
            </div>
            <div>
              <h3 className="font-semibold mb-1">My Orders</h3>
              <p className="text-sm text-gray-400 mb-3">Track print status and delivery</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#00cc66' }}>
                View orders <ArrowRight size={12} />
              </span>
            </div>
          </Link>

          <Link href="/account/quotes" className="bg-white rounded-2xl border border-black/[0.06] p-6 group hover:border-[#00cc6630] transition-colors flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#4a9eff12', color: '#4a9eff' }}>
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Saved Quotes</h3>
              <p className="text-sm text-gray-400 mb-3">Revisit and convert past quotes</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#4a9eff' }}>
                View quotes <ArrowRight size={12} />
              </span>
            </div>
          </Link>
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-black/[0.06] p-6">
          <h2 className="font-semibold mb-4">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/upload" className="text-sm font-semibold px-5 py-2.5 rounded-xl text-black transition-opacity hover:opacity-80" style={{ background: '#00cc66' }}>
              New quote
            </Link>
            <Link href="/products" className="text-sm font-semibold px-5 py-2.5 rounded-xl border border-black/10 hover:bg-gray-50 transition-colors">
              Browse products
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
