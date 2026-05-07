import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex max-w-[520px] flex-col items-center gap-5 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 font-display text-3xl font-bold text-blue-900 shadow-glow-amber">
          ?
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">
          404 · Not found
        </p>
        <h1 className="font-display text-[clamp(36px,5vw,52px)] font-normal leading-none tracking-tight">
          Woops, this page doesn’t exist <em className="italic text-amber-500">yet</em>.
        </h1>
        <p className="text-lg leading-relaxed text-fg-secondary">
          We’re probably working on it. In the meantime, head back home and find something to be a superhero about.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2.5} />
          Take me home
        </Link>
      </div>
    </div>
  )
}
