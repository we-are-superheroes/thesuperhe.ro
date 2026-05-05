import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import {
  Leaf,
  ArrowRight,
  UserCheck,
  Search,
  Handshake,
  Waves,
  Zap,
  Users,
  FolderOpen,
  Target,
  Quote,
} from 'lucide-react'

/* ================================================================
   MARKETING HOMEPAGE
   Mirrors the design system's marketing UI kit exactly.
   ================================================================ */

export default function MarketingHomePage() {
  return (
    <div className="h-screen overflow-y-auto">
      <Navbar />
      <Hero />
      <HowItWorks />
      <FeaturedProjects />
      <ImpactBanner />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  )
}

/* ── Navbar ──────────────────────────────────────────────────── */

function Navbar() {
  return (
    <div className="sticky top-0 z-50 border-b border-transparent bg-transparent backdrop-blur-none transition-all duration-300 supports-[backdrop-filter]:bg-blue-900/90 supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:border-white/[0.08]">
      <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-8 py-4">
        <Logo />
        <nav className="ml-6 flex flex-1 gap-1">
          {['How it works', 'Projects', 'Impact', 'Community'].map(
            (label) => (
              <button
                key={label}
                className="rounded-lg border-none bg-transparent px-3.5 py-1.5 text-sm font-medium text-neutral-400 transition-colors duration-fast hover:text-fg-primary"
              >
                {label}
              </button>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" href="/sign-in">
            Sign in
          </Button>
          <Button variant="primary" size="sm" href="/sign-up">
            Get started
            <ArrowRight className="size-[13px]" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Hero ────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-8 py-20">
      {/* Background radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(46,95,170,0.25) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 80% 60%, rgba(244,165,53,0.08) 0%, transparent 60%)
          `,
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#8097B5 1px, transparent 1px), linear-gradient(90deg, #8097B5 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 max-w-[760px] text-center">
        {/* Eyebrow pill */}
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/15 px-4 py-1.5 text-xs font-semibold tracking-widest text-blue-300">
          <Leaf className="size-[13px]" />
          4,000+ sustainability projects live now
        </div>

        <h1 className="mb-6 font-display text-[clamp(44px,7vw,80px)] leading-[1.1] tracking-tight text-fg-primary">
          Be the hero
          <br />
          <span className="italic text-amber-500">the planet needs.</span>
        </h1>

        <p className="mx-auto mb-10 max-w-[520px] text-[clamp(16px,2vw,20px)] leading-relaxed text-neutral-300">
          Find sustainability projects that need exactly what you bring. Every
          contribution counts.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" size="lg" href="/sign-up">
            Start your journey
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" size="lg" href="/projects">
            Browse projects
          </Button>
        </div>

        {/* Social proof */}
        <div className="mt-12 flex flex-wrap justify-center gap-6">
          {[
            ['12k+', 'Active heroes'],
            ['4k+', 'Open projects'],
            ['89%', 'Match rate'],
          ].map(([num, label]) => (
            <div key={label} className="text-center">
              <div className="font-display text-[28px] text-fg-primary">
                {num}
              </div>
              <div className="text-xs font-medium text-neutral-500">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── How It Works ────────────────────────────────────────────── */

const HOW_STEPS = [
  {
    icon: UserCheck,
    title: 'Create your profile',
    desc: "Tell us your skills, interests, and how much time you have. We'll find your perfect match.",
  },
  {
    icon: Search,
    title: 'Discover projects',
    desc: 'Browse thousands of sustainability missions across climate, biodiversity, energy, and more.',
  },
  {
    icon: Handshake,
    title: 'Join and contribute',
    desc: 'Apply to join a project team. Start making a real, measurable impact right away.',
  },
]

function HowItWorks() {
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-14 text-center">
          <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            How it works
          </div>
          <h2 className="font-display text-[clamp(32px,4vw,48px)] leading-tight text-fg-primary">
            Three steps to your{' '}
            <span className="italic text-amber-500">mission.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {HOW_STEPS.map((step, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-bg-surface p-8"
            >
              {/* Background number */}
              <div className="pointer-events-none absolute right-5 top-5 font-display text-[72px] leading-none text-white/[0.03]">
                {i + 1}
              </div>
              <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-500/15">
                <step.icon className="size-[22px] text-blue-300" />
              </div>
              <div className="mb-2.5 text-lg font-semibold text-fg-primary">
                {step.title}
              </div>
              <div className="text-sm leading-relaxed text-neutral-400">
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Featured Projects ───────────────────────────────────────── */

const FEATURED = [
  {
    title: 'Pacific Plastic Mapping',
    cat: 'Ocean Health',
    contributors: 12,
    desc: 'Satellite data to track plastic accumulation zones.',
    grad: 'linear-gradient(135deg, #1B3A6B, #0E2A4A)',
    icon: Waves,
  },
  {
    title: 'Urban Pollinator Corridors',
    cat: 'Biodiversity',
    contributors: 8,
    desc: 'Restoring bee-friendly routes through cities.',
    grad: 'linear-gradient(135deg, #1A5C40, #0E2A1E)',
    icon: Leaf,
  },
  {
    title: 'Solar Grid Optimisation',
    cat: 'Clean Energy',
    contributors: 21,
    desc: 'ML models for rural solar panel efficiency.',
    grad: 'linear-gradient(135deg, #5C3600, #2E1A00)',
    icon: Zap,
  },
]

function FeaturedProjects() {
  return (
    <section className="px-8 pb-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Open now
            </div>
            <h2 className="font-display text-[clamp(28px,3.5vw,40px)] text-fg-primary">
              Featured projects
            </h2>
          </div>
          <Button variant="outline" size="sm">
            View all projects
            <ArrowRight className="size-[13px]" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURED.map((p) => (
            <div
              key={p.title}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface-2 transition-all duration-200 hover:-translate-y-[3px] hover:border-white/[0.15] hover:shadow-lg"
            >
              <div
                className="flex h-[100px] items-center justify-center"
                style={{ background: p.grad }}
              >
                <p.icon className="size-10 text-white/15" strokeWidth={1.25} />
              </div>
              <div className="p-5">
                <div className="mb-2.5">
                  <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-300">
                    {p.cat}
                  </span>
                </div>
                <div className="mb-2 text-base font-semibold text-fg-primary">
                  {p.title}
                </div>
                <div className="mb-4 text-[13px] leading-relaxed text-neutral-400">
                  {p.desc}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <Users className="size-[13px]" />
                    {p.contributors} contributors
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-500/25 bg-green-500/[0.12] px-2.5 py-0.5 text-[10px] font-semibold text-green-500">
                    <span className="size-[5px] rounded-full bg-green-500" />
                    Open
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Impact Banner ───────────────────────────────────────────── */

const STATS = [
  { num: '4,200+', label: 'Active projects', icon: FolderOpen },
  { num: '12,000+', label: 'Heroes worldwide', icon: Users },
  { num: '89%', label: 'Project match rate', icon: Target },
  { num: '34 tons', label: 'CO₂ offset tracked', icon: Leaf },
]

function ImpactBanner() {
  return (
    <section className="border-y border-white/[0.08] bg-bg-surface px-8 py-16">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-8 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="mx-auto mb-3.5 flex size-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/[0.12]">
              <s.icon className="size-5 text-blue-300" />
            </div>
            <div className="mb-1.5 font-display text-4xl text-fg-primary">
              {s.num}
            </div>
            <div className="text-[13px] font-medium text-neutral-500">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Testimonials ────────────────────────────────────────────── */

const QUOTES = [
  {
    quote:
      "I found a climate data project that needed exactly my GIS background. Within 3 weeks I'd contributed something real.",
    name: 'Mia Chen',
    role: 'Environmental Scientist',
    init: 'MC',
  },
  {
    quote:
      "The match algorithm is remarkable. It didn't just match my skills — it matched my values.",
    name: 'Tom Adeyemi',
    role: 'Software Engineer',
    init: 'TA',
  },
  {
    quote:
      "I'm a retired teacher with time to give. The Superhero gave me a second chapter as a research contributor.",
    name: 'Ruth Okafor',
    role: 'Volunteer Researcher',
    init: 'RO',
  },
]

function Testimonials() {
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-12 text-center">
          <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Real heroes
          </div>
          <h2 className="font-display text-[clamp(28px,3.5vw,44px)] text-fg-primary">
            Stories of{' '}
            <span className="italic text-amber-500">impact.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {QUOTES.map((q) => (
            <div
              key={q.name}
              className="rounded-2xl border border-white/[0.08] bg-bg-surface p-7"
            >
              <Quote className="mb-4 size-6 text-amber-500" />
              <div className="mb-5 text-[15px] italic leading-[1.7] text-neutral-300">
                &ldquo;{q.quote}&rdquo;
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-400 text-[13px] font-semibold text-fg-primary">
                  {q.init}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-fg-primary">
                    {q.name}
                  </div>
                  <div className="text-[11px] text-neutral-500">{q.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── CTA ─────────────────────────────────────────────────────── */

function CTA() {
  return (
    <section className="px-8 pb-24">
      <div className="relative mx-auto max-w-[900px] overflow-hidden rounded-3xl border border-white/[0.08] bg-bg-surface p-16 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% -10%, rgba(46,95,170,0.2) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10">
          <h2 className="mb-4 font-display text-[clamp(32px,4vw,52px)] leading-[1.15] text-fg-primary">
            Your skills are
            <br />
            <span className="italic text-amber-500">
              someone&apos;s solution.
            </span>
          </h2>
          <p className="mx-auto mb-9 max-w-[480px] text-base leading-[1.7] text-neutral-400">
            Join thousands of people using their talents to fight the climate
            crisis. Start for free, today.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" size="lg" href="/sign-up">
              Join the mission
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" size="lg">
              Learn more
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Footer ──────────────────────────────────────────────────── */

const FOOTER_COLS = [
  {
    title: 'Platform',
    links: ['Discover', 'How it works', 'For organisations', 'Pricing'],
  },
  {
    title: 'Categories',
    links: [
      'Climate Action',
      'Biodiversity',
      'Clean Energy',
      'Ocean Health',
      'Reforestation',
    ],
  },
  { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press', 'Contact'] },
]

function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-bg-surface px-8 pb-8 pt-14">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[240px] text-[13px] leading-[1.7] text-neutral-500">
              Projects to save the world.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                {col.title}
              </div>
              <div className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <Link
                    key={l}
                    href="#"
                    className="text-[13px] text-neutral-400 transition-colors duration-fast hover:text-fg-primary"
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-6">
          <div className="text-xs text-neutral-600">
            &copy; 2026 The Superhero. All rights reserved.
          </div>
          <div className="flex gap-4">
            {['Privacy', 'Terms', 'Cookies'].map((l) => (
              <Link
                key={l}
                href="#"
                className="text-xs text-neutral-600 hover:text-neutral-400"
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
