import { NextResponse } from 'next/server'

export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /sign-in
Disallow: /sign-up
Disallow: /account/

Sitemap: ${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fofus.in'}/sitemap.xml
`
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
