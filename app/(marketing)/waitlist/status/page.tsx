import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CheckCircle2, Info } from 'lucide-react'

/* Friendly landing for the waitlist email links (confirm + unsubscribe).
   The API routes do the work, then redirect here with ?state=. */

type State = 'confirmed' | 'already' | 'invalid' | 'unsubscribed'

const VALID: State[] = ['confirmed', 'already', 'invalid', 'unsubscribed']

export default async function WaitlistStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state: raw } = await searchParams
  const state: State = VALID.includes(raw as State) ? (raw as State) : 'invalid'
  const t = await getTranslations('marketing')

  const ok = state === 'confirmed' || state === 'already'

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className={`mb-6 flex size-14 items-center justify-center rounded-2xl ${
          ok ? 'bg-amber-500 text-amber-900' : 'bg-bg-surface-2 text-neutral-300'
        }`}
      >
        {ok ? <CheckCircle2 className="size-7" /> : <Info className="size-7" />}
      </div>
      <h1 className="mb-3 font-display text-4xl leading-tight tracking-tight">
        {t(`waitlist.status.${state}.title`)}
      </h1>
      <p className="mb-8 text-lg leading-relaxed text-neutral-300">
        {t(`waitlist.status.${state}.body`)}
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-md border border-white/[0.13] bg-bg-surface-2 px-5 py-3 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-bg-surface-3"
      >
        {t('waitlist.status.home')}
      </Link>
    </section>
  )
}
