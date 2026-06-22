import type { NextConfig } from "next"

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8001"

const nextConfig: NextConfig = {
  // Proxy browser-side /api/* to the FastAPI backend so we keep a single origin
  // in dev. Server components fetch directly via process.env.API_URL.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
    ]
  },
  // typedRoutes intentionally off: we build many href strings dynamically
  // (decision/[sku]/[channel]?period=&tab=) and casting at every site
  // doesn't add real safety, just noise.

  // Hide the on-screen dev indicator (the floating "N" / route status pill
  // in the corner of every page during `next dev`). It gets in the way of
  // demoing the actual UI.
  devIndicators: false,

}

export default nextConfig
