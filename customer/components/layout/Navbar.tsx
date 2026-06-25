'use client'

import Link from 'next/link'
import { UserButton, SignedIn, SignedOut } from '@clerk/nextjs'
import { Package } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/[0.06]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span style={{ color: '#00cc66' }}>●</span>
          <span>FOFUS</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <Link href="/" className="hover:text-black transition-colors">Home</Link>
          <Link href="/upload" className="hover:text-black transition-colors">Upload</Link>
          <Link href="/products" className="hover:text-black transition-colors">Products</Link>
          <Link href="/franchise" className="hover:text-black transition-colors">Franchise</Link>
        </div>

        <div className="flex items-center gap-3">
          <SignedOut>
            <Link href="/sign-in" className="text-sm text-gray-600 hover:text-black transition-colors">Sign in</Link>
            <Link
              href="/upload"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-black transition-opacity hover:opacity-80"
              style={{ background: '#00cc66' }}
            >
              Get Quote
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/account" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Package size={18} className="text-gray-600" />
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </nav>
  )
}
