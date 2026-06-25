import type { Metadata } from 'next'
import UploadStepper from '@/components/upload/UploadStepper'

export const metadata: Metadata = {
  title: 'Upload Your Design — FOFUS',
  description: 'Upload your 3D model or sketch and get an instant INR quote for printing.',
}

export default function UploadPage() {
  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-4 text-center">
        <h1 className="text-3xl font-bold mb-2">Get an instant quote</h1>
        <p className="text-gray-500">Upload → Material → Quote → Order. Done in 2 minutes.</p>
      </div>
      <UploadStepper />
    </div>
  )
}
