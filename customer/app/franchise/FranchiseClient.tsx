import { useState } from 'react'
import { ArrowRight, Printer, TrendingUp, MapPin, Zap, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

const HOW_IT_WORKS = [
  { icon: <Zap size={20} />, title: 'Apply online', desc: 'Fill our 2-minute application form. We review and respond within 48 hours.' },
  { icon: <Printer size={20} />, title: 'Set up your farm', desc: 'Purchase 1–3 Bambu Lab A1 or P1S printers. We provide setup support and config files.' },
  { icon: <MapPin size={20} />, title: 'Get local orders', desc: 'Our platform routes customer orders to the nearest available franchise. You print, we handle payment.' },
  { icon: <TrendingUp size={20} />, title: 'Earn & grow', desc: 'Earn 70% of every order. Scale up printers as demand grows in your city.' },
]

const STATS = [
  { val: '₹2–5L', label: 'Investment required', sub: 'Includes 1–2 printers' },
  { val: '70%', label: 'Revenue share', sub: 'Per completed order' },
  { val: '6–9 mo', label: 'Payback period', sub: 'Typical for 2 printers' },
  { val: '₹40K+', label: 'Monthly potential', sub: 'At 80% utilisation' },
]

export default function FranchiseClient() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.phone || !form.city) return
    setLoading(true)
    setError(null)
    try {
      await api.applyFranchise({ name: form.name, email: form.email, phone: form.phone, city: form.city, message: form.message || undefined })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pt-14">
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[70vh] flex items-center" style={{ background: 'linear-gradient(135deg, #080808 0%, #0a1a10 100%)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #00cc66 0%, transparent 70%)' }} />
        </div>
        <div className="max-w-6xl mx-auto px-4 py-20 relative z-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border mb-6" style={{ borderColor: '#00cc6640', color: '#00cc66' }}>
            Franchise Program · Open Now
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight max-w-2xl mb-6">
            Own a FOFUS franchise
          </h1>
          <p className="text-gray-400 text-xl max-w-xl mb-10 leading-relaxed">
            Turn 1–3 Bambu Lab printers into a profitable local manufacturing business. We bring the orders, you run the prints.
          </p>
          <a href="#apply" className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-2xl text-black" style={{ background: '#00cc66' }}>
            Apply now
            <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map(({ val, label, sub }) => (
            <div key={label} className="p-6 rounded-2xl border border-black/[0.06] text-center">
              <div className="text-3xl font-black mb-1" style={{ color: '#00cc66' }}>{val}</div>
              <div className="font-semibold text-sm mb-0.5">{label}</div>
              <div className="text-xs text-gray-400">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-2">How the franchise works</h2>
            <p className="text-gray-500">From application to first paycheck in 2 weeks</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ icon, title, desc }, i) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-black/[0.06]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-white" style={{ background: '#00cc66' }}>
                  {icon}
                </div>
                <div className="text-xs font-bold text-gray-300 mb-1">STEP {i + 1}</div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">Why franchise with FOFUS?</h2>
            <ul className="space-y-4">
              {[
                'Orders routed to your location automatically — no marketing needed',
                'Full dashboard with live print queue, earnings, and analytics',
                'Config files and profiles for every material pre-loaded',
                'Dedicated WhatsApp support channel for franchise partners',
                'Bulk filament procurement at discounted rates',
                '70% revenue share — highest in the market',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#00cc66' }} />
                  <span className="text-sm text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl overflow-hidden border border-black/[0.06] bg-gradient-to-br from-gray-50 to-white p-8">
            <div className="text-sm font-semibold text-gray-400 mb-4">SAMPLE MONTHLY EARNINGS</div>
            {[
              { label: '1 Bambu A1 · 70% utilisation', amount: '₹18,000' },
              { label: '2 Bambu A1 · 80% utilisation', amount: '₹42,000' },
              { label: '3 Bambu P1S · 80% utilisation', amount: '₹72,000' },
            ].map(({ label, amount }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-black/[0.04] last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="font-bold" style={{ color: '#00cc66' }}>{amount}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-4">Estimates at current rate card. Actual earnings depend on order volume and print time.</p>
          </div>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="bg-gray-50 py-20">
        <div className="max-w-xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Apply for a franchise</h2>
            <p className="text-gray-500">We review every application and respond within 48 hours</p>
          </div>

          {success ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#00cc6612' }}>
                <CheckCircle2 size={32} style={{ color: '#00cc66' }} />
              </div>
              <h3 className="text-xl font-bold mb-2">Application received!</h3>
              <p className="text-gray-500">We'll contact you at {form.email} within 48 hours.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="bg-white rounded-3xl border border-black/[0.06] p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Full name *</label>
                  <input required value={form.name} onChange={set('name')} placeholder="Rahul Kumar" className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">City *</label>
                  <input required value={form.city} onChange={set('city')} placeholder="Bengaluru" className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Email *</label>
                  <input required type="email" value={form.email} onChange={set('email')} placeholder="rahul@example.com" className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Phone *</label>
                  <input required type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">Message (optional)</label>
                <textarea value={form.message} onChange={set('message')} placeholder="Tell us a bit about your setup — how many printers you have or plan to buy, your city, and any questions." rows={3} className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-[#00cc66] resize-none" />
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-black disabled:opacity-60" style={{ background: '#00cc66' }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <>Submit Application <ArrowRight size={16} /></>}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
