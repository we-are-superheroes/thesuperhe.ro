import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  FolderOpen,
  Clock,
  Zap,
  Target,
  ArrowRight,
  Leaf,
  Waves,
  Globe,
  Users,
} from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const { userId } = await auth()
  const user = await db.user.findUnique({
    where: { id: userId! },
    select: { name: true },
  })

  const firstName = user?.name?.split(' ')[0] ?? 'Hero'

  return (
    <div className="p-7 pb-16">
      {/* Greeting */}
      <div className="mb-7">
        <h1 className="mb-1 font-display text-[28px] text-fg-primary">
          Welcome back,{' '}
          <span className="italic text-amber-500">{firstName}</span>
        </h1>
        <p className="text-sm text-neutral-400">
          You&apos;re making an impact. Keep going.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-7 flex flex-wrap gap-3">
        <StatCard
          value="0"
          suffix=" active"
          label="Projects"
          icon={FolderOpen}
          accentColor="#4A7FD4"
        />
        <StatCard
          value="0"
          suffix="h"
          label="Contributed"
          icon={Clock}
          accentColor="#3DAF7C"
        />
        <StatCard
          value="0"
          suffix=""
          label="Impact score"
          icon={Zap}
          accentColor="#F4A535"
        />
        <StatCard
          value="--"
          suffix="%"
          label="Match rate"
          icon={Target}
          accentColor="#3DAF7C"
        />
      </div>

      {/* Getting started */}
      <div className="mb-6">
        <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-neutral-300">
          Get started
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            title="Complete your profile"
            description="Add your skills and availability to get matched"
            href="/profile"
            icon={Target}
          />
          <ActionCard
            title="Discover projects"
            description="Browse open sustainability missions"
            href="/projects"
            icon={Globe}
          />
          <ActionCard
            title="Browse blueprints"
            description="Start a proven project in your community"
            href="/blueprints"
            icon={Leaf}
          />
        </div>
      </div>

      {/* Featured projects placeholder */}
      <div>
        <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-neutral-300">
          Recommended for you
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SAMPLE_PROJECTS.map((p) => (
            <div
              key={p.title}
              className="group cursor-pointer overflow-hidden rounded-[14px] border border-white/[0.08] bg-bg-surface-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-md"
            >
              <div
                className="flex h-[88px] items-center justify-center"
                style={{ background: p.grad }}
              >
                <p.icon
                  className="size-9 text-white/15"
                  strokeWidth={1.5}
                />
              </div>
              <div className="p-4">
                <div className="mb-1.5">
                  <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-300">
                    {p.category}
                  </span>
                </div>
                <div className="mb-1 text-sm font-semibold text-fg-primary">
                  {p.title}
                </div>
                <div className="mb-3 text-xs leading-relaxed text-neutral-400">
                  {p.desc}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <Users className="size-3" />
                    {p.contributors} contributors
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-500/25 bg-green-500/[0.12] px-2 py-0.5 text-[10px] font-semibold text-green-500">
                    <span className="size-[5px] rounded-full bg-green-500" />
                    Open
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Stat Card ───────────────────────────────────────────────── */

function StatCard({
  value,
  suffix,
  label,
  icon: Icon,
  accentColor,
}: {
  value: string
  suffix: string
  label: string
  icon: React.ComponentType<{ className?: string; color?: string }>
  accentColor: string
}) {
  return (
    <div className="min-w-[120px] flex-1 rounded-[14px] border border-white/[0.08] bg-bg-surface p-5">
      <div className="mb-2.5">
        <div
          className="flex size-[34px] items-center justify-center rounded-[9px]"
          style={{
            background: `${accentColor}20`,
            border: `1px solid ${accentColor}35`,
          }}
        >
          <Icon className="size-4" color={accentColor} />
        </div>
      </div>
      <div className="font-display text-[28px] leading-none text-fg-primary">
        {value}
        <span className="text-xl" style={{ color: accentColor }}>
          {suffix}
        </span>
      </div>
      <div className="mt-1 text-[11px] font-medium text-neutral-500">
        {label}
      </div>
    </div>
  )
}

/* ── Action Card ─────────────────────────────────────────────── */

function ActionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-bg-surface-2 p-4 transition-all duration-fast hover:border-white/[0.13]"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-blue-400/25 bg-blue-500/15">
        <Icon className="size-[18px] text-blue-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg-primary">{title}</div>
        <div className="text-xs text-neutral-400">{description}</div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-neutral-500 transition-transform duration-fast group-hover:translate-x-0.5" />
    </Link>
  )
}

/* ── Sample Data ─────────────────────────────────────────────── */

const SAMPLE_PROJECTS = [
  {
    title: 'Pacific Plastic Mapping',
    desc: 'Satellite data to track ocean plastic accumulation zones.',
    category: 'Ocean Health',
    contributors: 12,
    grad: 'linear-gradient(135deg, #1B3A6B, #0E2A4A)',
    icon: Waves,
  },
  {
    title: 'Urban Pollinator Corridors',
    desc: 'Restoring bee-friendly routes through cities.',
    category: 'Biodiversity',
    contributors: 8,
    grad: 'linear-gradient(135deg, #1A5C40, #0E2A1E)',
    icon: Leaf,
  },
  {
    title: 'Solar Grid Optimisation',
    desc: 'ML models for rural solar panel efficiency.',
    category: 'Clean Energy',
    contributors: 21,
    grad: 'linear-gradient(135deg, #5C3600, #2E1A00)',
    icon: Zap,
  },
]
