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
