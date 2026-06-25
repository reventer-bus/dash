import { NextResponse } from 'next/server'

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN ?? 'store.fofus.in'
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN ?? ''

const QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle productType vendor
          descriptionHtml
          tags
          featuredImage { url altText }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          variants(first: 5) {
            edges {
              node { id title price sku availableForSale }
            }
          }
        }
      }
    }
  }
`

export async function GET(req: Request) {
  const url = new URL(req.url)
  const first = parseInt(url.searchParams.get('first') ?? '20')
  const after = url.searchParams.get('after') ?? null

  if (!SHOPIFY_TOKEN) {
    return NextResponse.json({ error: 'Shopify token not configured', products: [] }, { status: 200 })
  }

  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query: QUERY, variables: { first, after } }),
    next: { revalidate: 300 }, // cache 5 min
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Shopify API error', products: [] }, { status: 200 })
  }

  const data = await res.json()
  const edges = data?.data?.products?.edges ?? []
  const products = edges.map(({ node }: { node: Record<string, unknown> }) => node)
  const pageInfo = data?.data?.products?.pageInfo ?? {}

  return NextResponse.json({ products, pageInfo })
}
