import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['pdfjs-dist', 'xlsx'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(Array.isArray(config.externals) ? config.externals : []), 'better-sqlite3', 'pdfjs-dist', 'xlsx']
    }
    return config
  },
}

export default nextConfig
