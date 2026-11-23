import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  logging: {
    incomingRequests: { ignore: [/^\/(?:ar|en)\/(?:login|activate)\?/] },
  },
  async redirects() {
    return [
      { source: '/', destination: '/en', permanent: false, has: [{ type: 'cookie', key: 'academy-locale', value: 'en' }] },
      { source: '/', destination: '/ar', permanent: false },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default config;
