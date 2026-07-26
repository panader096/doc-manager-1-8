import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// 'unsafe-inline' is required for script-src (Next.js App Router ships
// inline hydration/streaming scripts) and style-src (this project's design
// system uses inline `style={{ color: 'var(--x)' }}` throughout -- see
// CLAUDE.md). frame-ancestors 'none' + X-Frame-Options below is what
// actually stops clickjacking; the rest restricts default resource origins.
// 'unsafe-eval' is dev-only -- React's dev-mode debugging tools need it to
// reconstruct stack traces; React never calls eval() in production.
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${supabaseUrl}`,
  `connect-src 'self' ${supabaseUrl}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Next.js's Server Actions default to a 1MB request body limit, which sits
  // well below Harry's own INGEST_MAX_BYTES (20MB) check in
  // app/lib/harry-actions.ts -- createChat(title, file) passes the uploaded
  // PDF straight through the Server Action boundary, so any file over 1MB
  // was rejected by the framework (a generic 413) before our own, clearer
  // size-limit error ever got a chance to run. Set above our own cap so our
  // explicit check is what actually enforces the limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
