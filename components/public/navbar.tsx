import Link from 'next/link'

/**
 * Public top nav shown to anonymous viewers on routes that don't require
 * sign-in (the marketing homepage and the public project pages).
 * Matches the marketing homepage navbar so a visitor moving between them
 * sees a consistent shell.
 */
export function PublicNavbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-blue-900/[0.78] backdrop-blur-2xl backdrop-saturate-[1.4]">
      {/* Fixed height (not padding-derived) so sticky elements below the bar
          can use an exact top offset (the project page's tab bar). */}
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:h-16 sm:gap-8 sm:px-8">
        <Link href="/" className="flex items-center gap-2 sm:gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-amber-400 font-display text-base font-bold text-blue-900 shadow-glow-amber sm:size-8 sm:text-lg">
            S
          </div>
          <span className="font-display text-base tracking-tight sm:text-xl">
            The Superhero
          </span>
        </Link>

        <div className="hidden gap-8 text-sm text-neutral-300 lg:flex">
          <Link
            href="/projects"
            className="transition-colors duration-fast hover:text-fg-primary"
          >
            Browse projects
          </Link>
          <Link
            href="/#how"
            className="transition-colors duration-fast hover:text-fg-primary"
          >
            How it works
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/sign-in"
            className="hidden items-center gap-2 rounded-md border border-white/[0.13] bg-transparent px-[18px] py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-white/[0.04] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber sm:px-[18px] sm:py-2.5"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  )
}
