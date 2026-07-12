import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { deDE, esES, frFR, itIT, ptPT, ruRU, ukUA } from '@clerk/localizations'
import { Analytics } from '@vercel/analytics/next'
import { resolveLocale, type Locale } from '@/lib/locale'
import './globals.css'

/** Clerk widget translations per locale; English uses Clerk's default. */
const CLERK_LOCALIZATIONS: Partial<Record<Locale, typeof frFR>> = {
  fr: frFR,
  de: deDE,
  es: esES,
  it: itIT,
  ru: ruRU,
  uk: ukUA,
  pt: ptPT,
}

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale()
  return (
    <ClerkProvider
      localization={CLERK_LOCALIZATIONS[locale]}
      appearance={{
        baseTheme: dark,
        // The CDN-loaded clerk-js runtime ignores the legacy appearance
        // variable names (colorText / colorInputBackground / colorInputText /
        // colorTextSecondary), which is why the card previously showed dark
        // text and default-white inputs. Use the current names so the dark
        // auth card is legible regardless of whether baseTheme applies.
        variables: {
          // Accent
          colorPrimary: '#F4A535',
          colorPrimaryForeground: '#0E1A2B',
          // Surfaces
          colorBackground: '#152236',
          colorInput: '#1E3148',
          colorMuted: '#1E3148',
          // Text
          colorForeground: '#EBF1F7',
          colorInputForeground: '#EBF1F7',
          colorMutedForeground: '#A8BCCE',
          // Borders / focus — light neutral so field outlines, dividers and
          // hovered surfaces are visible on the dark card (default is black).
          colorNeutral: '#EBF1F7',
          colorBorder: 'rgba(235, 241, 247, 0.22)',
          colorRing: '#F4A535',
          // Status
          colorDanger: '#F4736B',
          colorSuccess: '#3DAF7C',
          colorWarning: '#F4A535',
          borderRadius: '8px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        },
      }}
    >
      <html
        lang={locale}
        suppressHydrationWarning
        className={`${dmSans.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        </head>
        <body className="min-h-full font-sans">
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
