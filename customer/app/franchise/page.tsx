import type { Metadata } from 'next'
import FranchiseClient from './FranchiseClient'

export const metadata: Metadata = {
  title: 'FOFUS Franchise — Start Your 3D Print Business',
  description: 'Own a FOFUS franchise with 1–3 Bambu Lab printers. Earn 70% revenue share per order. Apply online in 2 minutes.',
  openGraph: {
    title: 'FOFUS Franchise — Start Your 3D Print Business',
    description: 'Own a local 3D print franchise in India. Earn up to ₹72K/month with FOFUS.',
  },
}

export default function FranchisePage() {
  return <FranchiseClient />
}
