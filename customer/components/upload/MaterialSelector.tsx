'use client'

interface Material {
  id: string
  label: string
  desc: string
  rate: number
  color: string
}

const MATERIALS: Material[] = [
  { id: 'PLA',    label: 'PLA',    desc: 'Prototypes & display models', rate: 2.5, color: '#4a9eff' },
  { id: 'PETG',   label: 'PETG',   desc: 'Durable, food-safe parts',    rate: 3.5, color: '#00cc66' },
  { id: 'ABS',    label: 'ABS',    desc: 'Heat & impact resistant',      rate: 3.0, color: '#ff9800' },
  { id: 'TPU',    label: 'TPU',    desc: 'Flexible, rubber-like',        rate: 5.0, color: '#a855f7' },
  { id: 'PLA-CF', label: 'PLA-CF', desc: 'Carbon fibre reinforced',      rate: 8.0, color: '#374151' },
  { id: 'NYLON',  label: 'NYLON',  desc: 'Engineering-grade strength',   rate: 6.0, color: '#ef4444' },
]

interface Props {
  material: string
  layerHeight: string
  infill: number
  onChange: (vals: { material?: string; layerHeight?: string; infill?: number }) => void
  liveRates?: Record<string, number>
}

export default function MaterialSelector({ material, layerHeight, infill, onChange, liveRates }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <p className="font-semibold mb-4">Choose material</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MATERIALS.map((m) => {
            const rate = liveRates?.[m.id] ?? m.rate
            const selected = material === m.id
            return (
              <button
                key={m.id}
                onClick={() => onChange({ material: m.id })}
                className="p-4 rounded-2xl border text-left transition-all"
                style={{
                  borderColor: selected ? m.color : 'rgba(0,0,0,0.08)',
                  background: selected ? `${m.color}0a` : 'white',
                }}
              >
                <div className="font-bold text-sm mb-0.5" style={{ color: m.color }}>{m.label}</div>
                <div className="text-xs text-gray-400 mb-2">{m.desc}</div>
                <div className="text-xs font-semibold">₹{rate}<span className="font-normal text-gray-400">/g</span></div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold mb-2">Layer Height</label>
          <select
            value={layerHeight}
            onChange={(e) => onChange({ layerHeight: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:border-[#00cc66]"
          >
            <option value="0.10">0.10 mm — High quality</option>
            <option value="0.15">0.15 mm — Quality</option>
            <option value="0.20">0.20 mm — Standard</option>
            <option value="0.25">0.25 mm — Draft</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Infill Density</label>
            <span className="text-sm font-bold" style={{ color: '#00cc66' }}>{infill}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={80}
            step={5}
            value={infill}
            onChange={(e) => onChange({ infill: Number(e.target.value) })}
            className="w-full accent-[#00cc66]"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>5% Light</span>
            <span>40% Standard</span>
            <span>80% Solid</span>
          </div>
        </div>
      </div>
    </div>
  )
}
