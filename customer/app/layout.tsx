import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FOFUS — From Idea to Product in 48 Hours',
  description: 'Upload your design, get an instant INR quote, and receive a 3D-printed product at your door — made by local FOFUS franchise partners in India.',
  metadataBase: new URL('https://fofus.in'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'FOFUS — 3D Print On Demand',
    description: 'India\'s franchise-powered 3D print network. Upload. Quote. Print. Delivered.',
    siteName: 'FOFUS',
    url: 'https://fofus.in',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FOFUS — From Idea to Product in 48 Hours',
    description: 'India\'s franchise-powered 3D print network. Upload your design, get a quote, and receive a 3D-printed product at your door.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  )
}
