import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function QuotesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/account" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-black transition-colors mb-6">
          <ArrowLeft size={14} /> Back to account
        </Link>
        <h1 className="text-2xl font-bold mb-8">Saved Quotes</h1>

        <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center">
          <p className="text-gray-400 mb-2">No saved quotes</p>
          <p className="text-sm text-gray-300 mb-6">Quotes from your upload flow will appear here</p>
          <Link href="/upload" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-black" style={{ background: '#00cc66' }}>
            Get a quote
          </Link>
        </div>
      </div>
    </div>
  )
}
