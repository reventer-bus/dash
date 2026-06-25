import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'FOFUS — From Idea to Product in 48 Hours',
  description: 'Upload your design, get an instant quote, and receive a 3D-printed product at your door.',
  openGraph: {
    title: 'FOFUS — 3D Print On Demand',
    description: 'India\'s franchise-powered 3D print network. Upload. Quote. Print. Delivered.',
    siteName: 'FOFUS',
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
