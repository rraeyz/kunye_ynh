/** @type {import('next').NextConfig} */
// İçerik Güvenlik Politikası: sayfa yalnızca kendi kaynaklarını ve gömme bloklarının (YouTube, Spotify,
// X, Instagram) servislerini yükleyebilir. Next.js satır içi script ürettiği için 'unsafe-inline' gerekli;
// yine de başka sitelerden script, form gönderimi, <object>, <base> değişikliği ve dışarıya veri
// gönderimi (connect-src) engellenir. Görseller her https adresinden olabilir (özel link ikonları).
const isDev = process.env.NODE_ENV !== 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://platform.twitter.com https://www.instagram.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  "connect-src 'self' https://cdn.syndication.twimg.com",
  // 'self': admin panelindeki canlı önizleme siteyi iframe'de açar
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://platform.twitter.com https://syndication.twitter.com https://www.instagram.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
]

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Görsel optimizasyon proxy'si kapalı: önceden hostname '**' ile herkes
  // /_next/image üzerinden istediği uzak görseli sunucumuza işletebiliyordu.
  // Yüklenen görseller zaten yükleme anında sharp ile küçültülüyor.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Native modülleri webpack bundle'ına ALMA, runtime'da node_modules'dan yükle
  // better-sqlite3 .node binary'si bundle'lanamaz
  experimental: {
    // src/instrumentation.ts: açılışta gizli anahtar ve günlük otomatik işler
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      'better-sqlite3',
      '@prisma/client',
      '@prisma/adapter-better-sqlite3',
      '@prisma/driver-adapter-utils',
      'bcryptjs',
      'jsonwebtoken',
      'nodemailer',
      'geoip-lite',
      'ua-parser-js',
      'sharp',
    ],
    outputFileTracingIncludes: {
      // Paylaşım görseli (src/app/api/og) yazı tiplerini çalışma anında dosyadan okur
      '/api/og': ['./node_modules/@fontsource/poppins/files/poppins-latin*-{400,700}-normal.woff'],
      '/': [
        './generated/**/*',
        './node_modules/bcryptjs/**/*',
        './node_modules/jsonwebtoken/**/*',
        './node_modules/nodemailer/**/*',
        './node_modules/geoip-lite/**/*',
        './node_modules/ua-parser-js/**/*',
        './node_modules/qrcode.react/**/*',
        './node_modules/framer-motion/**/*',
        './node_modules/recharts/**/*',
        './node_modules/@dnd-kit/**/*',
        './node_modules/react-icons/**/*',
        './node_modules/@prisma/**/*',
        './node_modules/better-sqlite3/**/*',
      ],
    },
  },
}

module.exports = nextConfig
