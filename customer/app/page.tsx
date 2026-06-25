import Link from 'next/link'
import { ArrowRight, Upload, Cpu, Package, MapPin, TrendingUp, Users } from 'lucide-react'
import { api } from '@/lib/api'

async function getRates() {
  try {
    return await api.getRates()
  } catch {
    return null
  }
}

const MATERIALS = [
  { name: 'PLA', desc: 'Best for prototypes & display models', color: '#4a9eff', tag: 'Most Popular' },
  { name: 'PETG', desc: 'Durable, food-safe, moisture resistant', color: '#00cc66', tag: 'Recommended' },
  { name: 'ABS', desc: 'Heat & impact resistant, functional parts', color: '#ff9800', tag: '' },
  { name: 'TPU', desc: 'Flexible, rubber-like, wearable parts', color: '#a855f7', tag: '' },
]

export default async function Home() {
  const rates = await getRates()

  return (
    <div className="pt-14">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-white to-emerald-50 min-h-[90vh] flex items-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #00cc66 0%, transparent 70%)' }} />
        </div>
        <div className="max-w-6xl mx-auto px-4 py-24 relative z-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border mb-6" style={{ borderColor: '#00cc6630', color: '#00cc66', background: '#00cc6608' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00cc66' }} />
            Franchise-Powered 3D Print Network — India
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight max-w-3xl mb-6">
            From idea to<br />
            <span style={{ color: '#00cc66' }}>product</span> in<br />
            48 hours
          </h1>
          <p className="text-xl text-gray-500 max-w-xl mb-10 leading-relaxed">
            Upload your design, get an instant INR quote, and receive a 3D-printed product at your door — powered by local franchise partners.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/upload" className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-2xl text-black transition-all hover:scale-105" style={{ background: '#00cc66' }}>
              <Upload size={18} />
              Upload Your Design
              <ArrowRight size={16} />
            </Link>
            <Link href="/products" className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-2xl border border-black/10 text-gray-700 hover:bg-gray-50 transition-colors">
              Browse Products
            </Link>
          </div>

          <div className="flex flex-wrap gap-8 mt-16">
            {[['500+', 'Prints completed'], ['12', 'Cities covered'], ['48h', 'Average delivery'], ['₹150', 'Starting price']].map(([val, label]) => (
              <div key={label}>
                <div className="text-2xl font-bold">{val}</div>
                <div className="text-sm text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">How it works</h2>
          <p className="text-gray-500 text-lg">Three steps from idea to doorstep</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: <Upload size={24} />, step: '01', title: 'Upload your design', desc: 'Share an STL, OBJ, 3MF, image, or even a rough sketch. Our AI analyses your file and estimates dimensions.' },
            { icon: <Cpu size={24} />, step: '02', title: 'AI quote in seconds', desc: 'Choose your material, layer height, and infill. Get an itemised INR quote — material cost + machine time + service fee.' },
            { icon: <Package size={24} />, step: '03', title: 'Printed & delivered', desc: 'Your order goes to the nearest franchise partner. They print, QC, and ship. Track every step in real-time.' },
          ].map(({ icon, step, title, desc }) => (
            <div key={step} className="relative p-8 rounded-3xl border border-black/[0.06] bg-white group hover:border-[#00cc6630] transition-colors">
              <div className="absolute top-6 right-6 text-5xl font-black text-black/[0.04] select-none">{step}</div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 text-white" style={{ background: '#00cc66' }}>
                {icon}
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Materials */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-2">Materials</h2>
              <p className="text-gray-500">Professional-grade filaments for every application</p>
            </div>
            {rates && (
              <span className="text-xs text-gray-400">Prices auto-updated from our pricing API</span>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MATERIALS.map(({ name, desc, color, tag }) => {
              const rate = rates?.material_rates_per_g_inr?.[name]
              return (
                <div key={name} className="bg-white rounded-2xl p-6 border border-black/[0.06] hover:border-[#00cc6630] transition-colors">
                  {tag && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-3 inline-block" style={{ background: color + '18', color }}>
                      {tag}
                    </span>
                  )}
                  <div className="text-2xl font-black mb-1" style={{ color }}>{name}</div>
                  <p className="text-sm text-gray-500 mb-4 leading-relaxed">{desc}</p>
                  {rate && (
                    <div className="text-sm font-semibold">₹{rate}<span className="font-normal text-gray-400">/g</span></div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {[
            { icon: <Users size={28} />, val: '50+', label: 'Franchise Partners', sub: 'Across 12 cities' },
            { icon: <TrendingUp size={28} />, val: '₹12L+', label: 'Revenue Generated', sub: 'For our partners' },
            { icon: <MapPin size={28} />, val: '12', label: 'Cities', sub: 'And growing' },
          ].map(({ icon, val, label, sub }) => (
            <div key={label} className="p-8 rounded-3xl border border-black/[0.06]">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#00cc6612', color: '#00cc66' }}>
                {icon}
              </div>
              <div className="text-3xl font-black mb-1">{val}</div>
              <div className="font-semibold mb-0.5">{label}</div>
              <div className="text-sm text-gray-400">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Franchise CTA */}
      <section className="mx-4 mb-24 rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #080808 0%, #0d1a11 100%)' }}>
        <div className="max-w-4xl mx-auto px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border mb-6" style={{ borderColor: '#00cc6640', color: '#00cc66' }}>
            Franchise Opportunity
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">Start your print franchise</h2>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
            Invest ₹2–5L, own 1–3 Bambu Lab printers, and earn from every order in your city. FOFUS handles the customers, you handle the prints.
          </p>
          <Link href="/franchise" className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-2xl text-black" style={{ background: '#00cc66' }}>
            Apply for franchise
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
