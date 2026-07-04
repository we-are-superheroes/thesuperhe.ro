/* Shared layout bits for the legal pages (/privacy, /terms). */

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-8 sm:py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-500">
        Legal
      </p>
      <h1 className="font-display text-[clamp(32px,4vw,44px)] leading-tight tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-sm text-fg-tertiary">Last updated: {updated}</p>
      {children}
    </div>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-2xl tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-fg-secondary">
        {children}
      </div>
    </section>
  )
}
