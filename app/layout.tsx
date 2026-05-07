import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import './globals.css'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
})

const dmSerifDisplay = DM_Serif_Display({
  variable: '--font-dm-serif-display',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'The Superhero — Projects to save the world',
  description:
    'Connect your skills with climate and sustainability projects that need you. Every contribution counts.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E1A2B',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#F4A535',
          colorBackground: '#152236',
          colorInputBackground: '#1E3148',
          colorText: '#EBF1F7',
          colorTextSecondary: '#A8BCCE',
          borderRadius: '8px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        },
      }}
    >
      <html
        lang="en"
        className={`${dmSans.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <body className="min-h-full font-sans">{children}</body>
      </html>
    </ClerkProvider>
  )
}
