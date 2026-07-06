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

const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': 'https://fofus.in/#business',
  name: 'FOFUS — GNI Labs LLP',
  url: 'https://fofus.in',
  email: 'support@fofus.in',
  telephone: '+91-9895854640',
  description:
    'Franchise-powered 3D print-on-demand network. Upload a design, get an instant INR quote, printed and delivered by local FOFUS partners across India.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Thommana',
    addressLocality: 'Irinjalakuda',
    addressRegion: 'Kerala',
    postalCode: '680121',
    addressCountry: 'IN',
  },
  sameAs: ['https://store.fofus.in'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
          />
          <Navbar />
          <main>{children}</main>
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  )
}
