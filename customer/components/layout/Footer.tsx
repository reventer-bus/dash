import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-black/[0.06] bg-white mt-24">
      <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="font-bold text-base mb-3 flex items-center gap-2">
            <span style={{ color: '#00cc66' }}>●</span> FOFUS
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            India&apos;s franchise-powered 3D print network. From idea to product in 48 hours.
          </p>
        </div>

        <div>
          <p className="font-semibold text-sm mb-3">Platform</p>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><Link href="/upload" className="hover:text-black transition-colors">Upload & Quote</Link></li>
            <li><Link href="/products" className="hover:text-black transition-colors">Ready Products</Link></li>
            <li><Link href="/account" className="hover:text-black transition-colors">My Account</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-sm mb-3">Franchise</p>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><Link href="/franchise" className="hover:text-black transition-colors">Own a Franchise</Link></li>
            <li><Link href="https://busienss.fofus.in" className="hover:text-black transition-colors">Partner Dashboard</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-sm mb-3">Legal</p>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><Link href="/privacy" className="hover:text-black transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-black transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-black/[0.04] max-w-6xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-gray-400">
        <span>© 2025 FOFUS. All rights reserved.</span>
        <span>Made in India 🇮🇳</span>
      </div>
    </footer>
  )
}
