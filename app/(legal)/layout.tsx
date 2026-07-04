import { PublicNavbar } from '@/components/public/navbar'

/**
 * Layout for the legal pages (/privacy, /terms). Deliberately never uses
 * the platform sidebar shell — legal text reads like a document, signed in
 * or not, and the window scrolls normally.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
