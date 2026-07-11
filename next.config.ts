import type { NextConfig } from 'next'

/**
 * Pull the Supabase hostname out of NEXT_PUBLIC_SUPABASE_URL so next/image
 * can optimise images served from the public storage bucket.
 */
const supabaseHost = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
})()

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Image uploads travel through server actions; the default 1 MB body
      // cap rejected files well under our own storage limits (8 MB banners).
      // 10 MB leaves headroom for multipart overhead.
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: 'https' as const,
              hostname: supabaseHost,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : [
            {
              protocol: 'https' as const,
              hostname: '*.supabase.co',
              pathname: '/storage/v1/object/public/**',
            },
          ]),
    ],
  },
}

export default nextConfig
