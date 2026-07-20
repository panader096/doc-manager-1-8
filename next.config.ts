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
