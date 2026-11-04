import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Catalyst AppSail deploys a directory, so we ship the standalone bundle:
  // a minimal server.js plus only the traced node_modules, instead of
  // uploading the whole repo. See app-config.json buildPath.
  output: 'standalone',
  turbopack: {},
  serverExternalPackages: ['pdfjs-dist', 'xlsx'],
  // pdfjs loads its worker as a sibling file of pdf.mjs, even on Node where it
  // runs the "fake worker" in-process. Nothing imports that file statically, so
  // the trace skipped it and the standalone bundle shipped pdfjs under a hashed
  // directory without it — the route then died with "Setting up fake worker
  // failed: Cannot find module .../pdf.worker.mjs". Include it explicitly; it
  // lands at <standalone root>/node_modules/..., which is what the route points
  // GlobalWorkerOptions.workerSrc at.
  outputFileTracingIncludes: {
    '/api/selvam/parse-pdf': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  // Reverse-proxy Firebase's auth handler onto our own domain so OAuth stays
  // first-party (see lib/firebase.ts authDomain). Without this, the handler
  // lives on <project>.firebaseapp.com and Safari/PWA storage partitioning
  // breaks signInWithRedirect.
  async rewrites() {
    const fb = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    if (!fb) return []
    return [
      { source: '/__/auth/:path*', destination: `https://${fb}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `https://${fb}/__/firebase/:path*` },
    ]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(Array.isArray(config.externals) ? config.externals : []), 'better-sqlite3', 'pdfjs-dist', 'xlsx']
    }
    return config
  },
}

export default nextConfig
