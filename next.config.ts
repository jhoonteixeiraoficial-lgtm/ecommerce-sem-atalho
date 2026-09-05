import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => [
    {
      source: '/membros/login',
      destination: '/login',
      permanent: true,
    },
    {
      source: '/membros/cadastro',
      destination: '/cadastro',
      permanent: true,
    },
    {
      source: '/membros/onboarding',
      destination: '/onboarding',
      permanent: true,
    },
    {
      source: '/membros/acertive-ecom',
      destination: '/membros/assertive-ecommerce-ia',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
        {
          key: 'Content-Security-Policy',
          // connect-src explicitly lists both https and wss schemes for
          // Supabase: Chromium treats an https source as also permitting the
          // same-host wss upgrade, but Safari/WebKit does not always apply
          // that equivalence, which can silently block the Realtime
          // WebSocket (used only by the community chat/feed) on iOS.
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://player.twitch.tv https://www.youtube.com https://*.supabase.co;",
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ],
};

export default nextConfig;
