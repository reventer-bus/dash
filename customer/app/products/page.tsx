import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Browse 3D-Printed Products — FOFUS',
  description: 'Shop 3D-printed gifts, home décor, fashion accessories, and custom prints from FOFUS — made in India by local franchise partners.',
  openGraph: {
    title: 'Browse 3D-Printed Products — FOFUS',
    description: 'Discover ready-to-ship and customisable products from India\'s franchise-powered 3D print network.',
  },
}

interface ShopifyProduct {
  id: string
  title: string
  handle: string
  productType: string
  vendor: string
  tags: string[]
  featuredImage: { url: string; altText: string } | null
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } }
  variants: { edges: { node: { id: string; title: string; price: string; sku: string } }[] }
}

async function getProducts(): Promise<ShopifyProduct[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/products?first=24`, { next: { revalidate: 300 } })
    const data = await res.json()
    return data.products ?? []
  } catch {
    return []
  }
}

const CATEGORIES = ['Gifts', 'Home decor', 'Fashion accessories', 'Home essentials', 'Kids', 'Custom Print']

export default async function ProductsPage() {
  const products = await getProducts()

  // JSON-LD structured data for products (PLAN #9 — SEO)
  const productJsonLd = products.map(p => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: p.featuredImage?.url ? [p.featuredImage.url] : undefined,
    description: `${p.title} — 3D printed by FOFUS franchise partners in India`,
    brand: { '@type': 'Brand', name: p.vendor || 'FOFUS' },
    category: p.productType,
    offers: {
      '@type': 'Offer',
      price: parseFloat(p.priceRangeV2.minVariantPrice.amount).toFixed(2),
      priceCurrency: p.priceRangeV2.minVariantPrice.currencyCode || 'INR',
      availability: 'https://schema.org/InStock',
      url: `https://store.fofus.in/products/${p.handle}`,
    },
  }))

  return (
    <div className="pt-14 min-h-screen bg-gray-50">
      {productJsonLd.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">Products</h1>
            <p className="text-gray-500">3D-printed in India by FOFUS franchise partners</p>
          </div>
          <Link
            href="/upload"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-black"
            style={{ background: '#00cc66' }}
          >
            Upload custom design <ArrowRight size={14} />
          </Link>
        </div>

        {products.length === 0 ? (
          /* Fallback when Shopify token not configured or no products */
          <div className="text-center py-20">
            <p className="text-gray-400 mb-3">Browse our full catalogue on the FOFUS store</p>
            <a
              href="https://store.fofus.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-black"
              style={{ background: '#00cc66' }}
            >
              Visit store.fofus.in <ExternalLink size={14} />
            </a>
          </div>
        ) : (
          <>
            {/* Category chips */}
            <div className="flex flex-wrap gap-2 mb-8">
              {CATEGORIES.filter(c => products.some(p => p.productType === c)).map(cat => (
                <a
                  key={cat}
                  href={`#${cat.toLowerCase().replace(/ /g, '-')}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/10 hover:border-[#00cc66] hover:text-[#00cc66] transition-colors"
                >
                  {cat}
                </a>
              ))}
            </div>

            {/* Product grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {products.map((product) => {
                const price = parseFloat(product.priceRangeV2.minVariantPrice.amount)
                const isCustom = product.productType === 'Custom Print'
                return (
                  <a
                    key={product.id}
                    href={`https://store.fofus.in/products/${product.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden hover:border-[#00cc6630] hover:shadow-sm transition-all group"
                  >
                    <div className="aspect-square bg-gray-50 relative overflow-hidden">
                      {product.featuredImage ? (
                        <Image
                          src={product.featuredImage.url}
                          alt={product.featuredImage.altText || product.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-200 text-4xl">
                          {isCustom ? '◈' : '●'}
                        </div>
                      )}
                      {isCustom && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full text-black" style={{ background: '#00cc66' }}>
                          CUSTOM
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-gray-400 mb-1">{product.vendor}</p>
                      <p className="font-semibold text-sm leading-tight mb-2 line-clamp-2">{product.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">₹{price.toFixed(0)}</span>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          store <ExternalLink size={10} />
                        </span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>

            <div className="mt-10 text-center">
              <a
                href="https://store.fofus.in"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl border border-black/10 hover:bg-gray-100 transition-colors"
              >
                View all products on store.fofus.in <ExternalLink size={14} />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
