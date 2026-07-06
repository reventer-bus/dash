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
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'FOFUS',
    description: 'India\'s franchise-powered 3D print network. Upload your design, get an instant INR quote, and receive a 3D-printed product at your door.',
    url: 'https://fofus.in',
    logo: 'https://fofus.in/logo.png',
    image: 'https://fofus.in/og-image.png',
    telephone: '+91-804-640',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Irinjalakuda, Thrissur',
      addressLocality: 'Thrissur',
      addressRegion: 'Kerala',
      postalCode: '680121',
      addressCountry: 'IN',
    },
    areaServed: 'India',
    priceRange: '₹150 - ₹5000',
    openingHours: 'Mo-Sa 09:00-18:00',
    sameAs: [
      'https://store.fofus.in',
      'https://www.instagram.com/fofus.in',
    ],
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  )
}
