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

/**
 * Flash-free theme init. Runs synchronously before the first paint so the
 * stored preference is applied to <html> with no dark→light flash. Kept in
 * sync with the picker + the `superhero-theme` localStorage key.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('superhero-theme');if(t&&t!=='dark'){document.documentElement.classList.add('theme-'+t);}}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        // Every contrast-bearing colour is set explicitly so the auth card
        // is legible even if the (older) @clerk/themes baseTheme defaults
        // don't fully apply under @clerk/nextjs v7. Previously colorInputText
        // and colorNeutral were left to the baseTheme, which produced dark
        // input text and near-invisible input outlines on the dark card.
        variables: {
          colorPrimary: '#F4A535',
          colorTextOnPrimaryBackground: '#0E1A2B',
          colorBackground: '#152236',
          colorInputBackground: '#1E3148',
          colorInputText: '#EBF1F7',
          colorText: '#EBF1F7',
          colorTextSecondary: '#A8BCCE',
          // Light neutral → visible field outlines, dividers, and icons.
          colorNeutral: '#EBF1F7',
          colorDanger: '#F4736B',
          colorSuccess: '#3DAF7C',
          colorWarning: '#F4A535',
          borderRadius: '8px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        },
      }}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${dmSans.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        </head>
        <body className="min-h-full font-sans">{children}</body>
      </html>
    </ClerkProvider>
  )
}
