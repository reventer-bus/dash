const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://fofus.in'

export interface PriceRequest {
  material: string
  weight_g: number
  print_time_min: number
  machine?: string
}

export interface PriceResponse {
  material: string
  machine: string
  weight_g: number
  print_time_min: number
  material_cost: number
  machine_cost: number
  service_fee: number
  total: number
  currency: string
  source: string
}

export interface RatesResponse {
  material_rates_per_g_inr: Record<string, number>
  machine_rates_per_hr_inr: Record<string, number>
  service_fee_pct: number
  currency: string
}

export interface OrderRequest {
  customer_name: string
  customer_email: string
  customer_phone?: string
  material: string
  machine?: string
  weight_g?: number
  print_time_min?: number
  quote_total?: number
  notes?: string
  file_name?: string
}

export interface ShopifyCheckoutRequest {
  customer_name: string
  customer_email: string
  customer_phone?: string
  material: string
  weight_g?: number
  print_time_min?: number
  quote_total: number
  file_name?: string
  notes?: string
}

export interface ShopifyCheckoutResponse {
  draft_order_id: string
  invoice_url: string
}

export interface PartnerRequest {
  name: string
  email: string
  phone: string
  city: string
  message?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getQuote: (body: PriceRequest) =>
    request<PriceResponse>('/api/v1/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRates: () => request<RatesResponse>('/api/v1/pricing/rates'),

  createOrder: (body: OrderRequest) =>
    request<{ id: string; status: string }>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createShopifyCheckout: (body: ShopifyCheckoutRequest) =>
    request<ShopifyCheckoutResponse>('/api/v1/shopify/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  applyFranchise: (body: PartnerRequest) =>
    request<{ id: string }>('/api/v1/partners', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  health: () => request<{ status: string }>('/health'),
}
