import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Catalyst AppSail deploys a directory, so we ship the standalone bundle:
  // a minimal server.js plus only the traced node_modules, instead of
  // uploading the whole repo. See app-config.json buildPath.
  output: 'standalone',
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
