import TrackClient from '@/components/track/TrackClient'

export const metadata = {
  title: 'Track your order — FOFUS',
  robots: { index: false, follow: false },
}

export default function TrackOrderPage({ params }: { params: { orderId: string } }) {
  return <TrackClient orderId={decodeURIComponent(params.orderId)} />
}
