'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Search,
  Bell,
  Plus,
  X,
  MapPin,
  LayoutGrid,
  List,
  Lock,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectBox } from '@/components/platform/project-form-bits'
import { ProjectStatusBadge } from '@/components/platform/project-status-badge'

/* ================================================================
   Types
   ================================================================ */

export interface BrowseProject {
  id: string
  title: string
  description: string
  status: string
  location: string
  country: string | null
  language: string | null
  type: string
  typeId: string | null
  imgKey: string
  coverImageUrl: string | null
  skills: string[]
  skillIds: string[]
  needs: number
  progress: number
  contributors: number
  org: { slug: string; name: string } | null
  membersOnly: boolean
  posted: string
  sortRecent: number
  sortNeeds: number
  sortProgress: number
}

interface FilterOption {
  id: string
  name: string
  count: number
}

interface LocationOption {
  name: string
  count: number
}

interface CodeOption {
  code: string
  label: string
  count: number
}

type SortKey = 'recent' | 'needs' | 'progress'

/* ================================================================
   Image-key → tailwind class map
   (each gradient mirrors the design's `.img-*` classes)
   ================================================================ */

const IMG_CLASS: Record<string, string> = {
  energy: '[background:radial-gradient(circle_at_60%_40%,#4A7FD4_0%,transparent_60%),linear-gradient(135deg,#0E1A2B,#2E5FAA)]',
  rewild: '[background:radial-gradient(circle_at_70%_60%,#4a8b6e_0%,transparent_60%),linear-gradient(135deg,#1a3d2c,#6b9d7e)]',
  circular: '[background:radial-gradient(circle_at_30%_50%,#f4a535_0%,transparent_70%),linear-gradient(160deg,#5C3600,#B86E00)]',
  policy: '[background:radial-gradient(circle_at_50%_30%,#B2D0F5_0%,transparent_65%),linear-gradient(160deg,#152236,#1B3A6B)]',
  food: '[background:radial-gradient(circle_at_25%_70%,#7DD3B0_0%,transparent_70%),linear-gradient(135deg,#1A5C40,#3DAF7C)]',
  mobility: '[background:radial-gradient(circle_at_70%_30%,#FAD08F_0%,transparent_60%),linear-gradient(160deg,#2E1A00,#8A5200)]',
  water: '[background:radial-gradient(circle_at_30%_50%,#7AAEE8_0%,transparent_65%),linear-gradient(135deg,#060D18,#1B3A6B)]',
  education: '[background:radial-gradient(circle_at_60%_50%,#F7BD64_0%,transparent_60%),linear-gradient(135deg,#2A3A52,#5A7090)]',
}

/* ================================================================
   Component
   ================================================================ */

export function BrowseProjectsClient({
  projects,
  projectTypes,
  skills,
  locations,
  countries,
  languages,
  myOrgs,
}: {
  projects: BrowseProject[]
  projectTypes: FilterOption[]
  skills: FilterOption[]
  locations: LocationOption[]
  countries: CodeOption[]
  languages: CodeOption[]
  /** Orgs the viewer belongs to — the org filter only exists for members. */
  myOrgs: Array<{ slug: string; name: string; count: number }>
}) {
  const [query, setQuery] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set())
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set())
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set())
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (query.trim()) {
          const hay = `${p.title} ${p.description} ${p.location} ${p.type}`.toLowerCase()
          if (!hay.includes(query.trim().toLowerCase())) return false
        }
        if (selectedTypes.size && (!p.typeId || !selectedTypes.has(p.typeId))) return false
        if (selectedSkills.size) {
          const hasMatch = p.skillIds.some((sid) => selectedSkills.has(sid))
          if (!hasMatch) return false
        }
        if (selectedLocations.size && !selectedLocations.has(p.location)) return false
        if (selectedCountries.size && (!p.country || !selectedCountries.has(p.country))) return false
        if (selectedLanguages.size && (!p.language || !selectedLanguages.has(p.language))) return false
        if (selectedOrgs.size && (!p.org || !selectedOrgs.has(p.org.slug))) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'recent') return a.sortRecent - b.sortRecent
        if (sort === 'needs') return b.sortNeeds - a.sortNeeds
        if (sort === 'progress') return b.sortProgress - a.sortProgress
        return 0
      })
  }, [
    projects,
    query,
    selectedTypes,
    selectedSkills,
    selectedLocations,
    selectedCountries,
    selectedLanguages,
    selectedOrgs,
    sort,
  ])

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSet(next)
  }

  const clearAll = () => {
    setQuery('')
    setSkillSearch('')
    setLocationSearch('')
    setCountrySearch('')
    setSelectedTypes(new Set())
    setSelectedSkills(new Set())
    setSelectedLocations(new Set())
    setSelectedCountries(new Set())
    setSelectedLanguages(new Set())
    setSelectedOrgs(new Set())
  }

  // Active chips derived from current state
  const activeChips: Array<{ kind: string; key: string; label: string }> = []
  if (query.trim()) activeChips.push({ kind: 'query', key: '', label: `"${query.trim()}"` })
  for (const id of selectedTypes) {
    const t = projectTypes.find((x) => x.id === id)
    if (t) activeChips.push({ kind: 'type', key: id, label: t.name })
  }
  for (const id of selectedSkills) {
    const s = skills.find((x) => x.id === id)
    if (s) activeChips.push({ kind: 'skill', key: id, label: s.name })
  }
  for (const loc of selectedLocations) {
    activeChips.push({ kind: 'location', key: loc, label: loc })
  }
  for (const code of selectedCountries) {
    const c = countries.find((x) => x.code === code)
    if (c) activeChips.push({ kind: 'country', key: code, label: c.label })
  }
  for (const code of selectedLanguages) {
    const l = languages.find((x) => x.code === code)
    if (l) activeChips.push({ kind: 'language', key: code, label: l.label })
  }
  for (const slug of selectedOrgs) {
    const o = myOrgs.find((x) => x.slug === slug)
    if (o) activeChips.push({ kind: 'org', key: slug, label: o.name })
  }

  const removeChip = (kind: string, key: string) => {
    if (kind === 'query') setQuery('')
    else if (kind === 'type') toggle(selectedTypes, setSelectedTypes, key)
    else if (kind === 'skill') toggle(selectedSkills, setSelectedSkills, key)
    else if (kind === 'location') toggle(selectedLocations, setSelectedLocations, key)
    else if (kind === 'country') toggle(selectedCountries, setSelectedCountries, key)
    else if (kind === 'language') toggle(selectedLanguages, setSelectedLanguages, key)
    else if (kind === 'org') toggle(selectedOrgs, setSelectedOrgs, key)
  }

  // Apply skill / location search filters to the visible filter list
  const visibleSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(skillSearch.trim().toLowerCase()),
  )
  const visibleLocations = locations.filter((l) =>
    l.name.toLowerCase().includes(locationSearch.trim().toLowerCase()),
  )
  const visibleCountries = countries.filter((c) =>
    c.label.toLowerCase().includes(countrySearch.trim().toLowerCase()),
  )

  const total = projects.length
  const showing = filtered.length

  return (
    <>
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="relative order-2 w-full min-w-0 max-w-[480px] flex-1 sm:order-1 sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <button
            type="button"
            className="hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
            title="Notifications"
          >
            <Bell className="size-[18px]" />
          </button>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Start a project</span>
            <span className="sm:hidden">Start</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
        {/* Page header */}
        <section>
          <h1 className="mb-3 font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
            Find a project<br />
            that <em className="italic text-amber-500">needs</em> you.
          </h1>
          <p className="max-w-[560px] text-base leading-relaxed text-fg-secondary sm:text-lg">
            Every project here is real, active, and looking for help. Filter by where you are, what you&apos;re good at, or what kind of work interests you.
          </p>
        </section>

        {/* Mobile filters toggle */}
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((o) => !o)}
          className="flex items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-bg-surface px-4 py-2.5 text-sm text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary lg:hidden"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {mobileFiltersOpen ? 'Hide filters' : 'Show filters'}
          </span>
          {activeChips.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-500">
              {activeChips.length} active
            </span>
          )}
        </button>

        {/* Browse layout */}
        <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Filters */}
          <aside
            className={cn(
              'flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6',
              'lg:sticky lg:top-6',
              mobileFiltersOpen ? 'flex' : 'hidden lg:flex',
            )}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-xl font-normal">Filters</h3>
              <button
                type="button"
                onClick={clearAll}
                className="cursor-pointer border-none bg-transparent text-xs text-amber-500 hover:underline"
              >
                Clear all
              </button>
            </div>

            {/* Your organisations (only shown to members of at least one) */}
            {myOrgs.length > 0 && (
              <FilterGroup label="Your organisations">
                <CheckList
                  items={myOrgs.map((o) => ({ id: o.slug, label: o.name, count: o.count }))}
                  selected={selectedOrgs}
                  onToggle={(k) => toggle(selectedOrgs, setSelectedOrgs, k)}
                />
              </FilterGroup>
            )}

            {/* Type */}
            <FilterGroup label="Type of project">
              <CheckList
                items={projectTypes.map((t) => ({ id: t.id, label: t.name, count: t.count }))}
                selected={selectedTypes}
                onToggle={(k) => toggle(selectedTypes, setSelectedTypes, k)}
              />
            </FilterGroup>

            {/* Skills */}
            <FilterGroup label="Skills needed">
              <FilterSearchInput
                value={skillSearch}
                onChange={setSkillSearch}
                placeholder="Search skills..."
              />
              <CheckList
                items={visibleSkills.map((s) => ({ id: s.id, label: s.name, count: s.count }))}
                selected={selectedSkills}
                onToggle={(k) => toggle(selectedSkills, setSelectedSkills, k)}
              />
            </FilterGroup>

            {/* Location */}
            <FilterGroup label="Location">
              <FilterSearchInput
                value={locationSearch}
                onChange={setLocationSearch}
                placeholder="Search locations..."
              />
              <CheckList
                items={visibleLocations.map((l) => ({ id: l.name, label: l.name, count: l.count }))}
                selected={selectedLocations}
                onToggle={(k) => toggle(selectedLocations, setSelectedLocations, k)}
              />
            </FilterGroup>

            {/* Country (ISO) */}
            {countries.length > 0 && (
              <FilterGroup label="Country">
                <FilterSearchInput
                  value={countrySearch}
                  onChange={setCountrySearch}
                  placeholder="Search countries..."
                />
                <CheckList
                  items={visibleCountries.map((c) => ({
                    id: c.code,
                    label: c.label,
                    count: c.count,
                  }))}
                  selected={selectedCountries}
                  onToggle={(k) => toggle(selectedCountries, setSelectedCountries, k)}
                />
              </FilterGroup>
            )}

            {/* Language */}
            {languages.length > 0 && (
              <FilterGroup label="Language">
                <CheckList
                  items={languages.map((l) => ({
                    id: l.code,
                    label: l.label,
                    count: l.count,
                  }))}
                  selected={selectedLanguages}
                  onToggle={(k) => toggle(selectedLanguages, setSelectedLanguages, k)}
                />
              </FilterGroup>
            )}
          </aside>

          {/* Results */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* Results head */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-fg-secondary">
                {showing === total ? (
                  <>Showing <strong className="font-semibold text-fg-primary">all {total}</strong> live projects</>
                ) : (
                  <>Showing <strong className="font-semibold text-fg-primary">{showing}</strong> of {total} projects</>
                )}
              </div>
              <div className="flex items-center gap-3">
                <SelectBox
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="w-auto cursor-pointer bg-bg-surface py-2 pl-3 pr-8 [background-position:right_10px_center]"
                >
                  <option value="recent">Most recent</option>
                  <option value="needs">Most help needed</option>
                  <option value="progress">Closest to finished</option>
                </SelectBox>
                <div className="flex rounded-lg border border-neutral-700 bg-bg-surface p-[3px]">
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    className={cn(
                      'flex items-center rounded-md border-none px-2.5 py-1.5 transition-colors',
                      view === 'grid' ? 'bg-bg-surface-2 text-fg-primary' : 'bg-transparent text-fg-tertiary',
                    )}
                    title="Grid view"
                  >
                    <LayoutGrid className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className={cn(
                      'flex items-center rounded-md border-none px-2.5 py-1.5 transition-colors',
                      view === 'list' ? 'bg-bg-surface-2 text-fg-primary' : 'bg-transparent text-fg-tertiary',
                    )}
                    title="List view"
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active chips */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeChips.map((chip) => (
                  <span
                    key={`${chip.kind}-${chip.key || chip.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.12] px-3 py-1.5 text-xs font-medium text-amber-500"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={() => removeChip(chip.kind, chip.key)}
                      className="flex items-center border-none bg-transparent p-0 text-amber-500 opacity-70 hover:opacity-100"
                      aria-label="Remove filter"
                    >
                      <X className="size-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Cards */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.04),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
                <h3 className="font-display text-2xl">No projects match those filters.</h3>
                <p className="max-w-[420px] text-base text-fg-secondary">
                  Try widening the location, removing a skill, or clearing the search box.
                </p>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {filtered.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((p) => (
                  <ProjectListRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </label>
      {children}
    </div>
  )
}

function FilterSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 py-2 pl-8 pr-3 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
      />
    </div>
  )
}

function CheckList({
  items,
  selected,
  onToggle,
}: {
  items: Array<{ id: string; label: string; count: number }>
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  if (items.length === 0) {
    return <div className="text-sm text-fg-tertiary">No matches.</div>
  }
  return (
    <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto pr-1">
      {items.map((item) => {
        const isChecked = selected.has(item.id)
        return (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-3 py-1 text-sm text-fg-secondary transition-colors hover:text-fg-primary"
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(item.id)}
              className="hidden"
            />
            <span
              className={cn(
                'flex size-[18px] shrink-0 items-center justify-center rounded transition-all duration-fast',
                isChecked
                  ? 'border-[1.5px] border-amber-500 bg-amber-500'
                  : 'border-[1.5px] border-neutral-600',
              )}
            >
              {isChecked && (
                <svg viewBox="0 0 24 24" fill="none" stroke="#2E1A00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className={cn(isChecked && 'font-medium text-fg-primary')}>{item.label}</span>
            <span className="ml-auto text-xs text-fg-tertiary">{item.count}</span>
          </label>
        )
      })}
    </div>
  )
}

function ProjectCard({ project: p }: { project: BrowseProject }) {
  const imgClass = IMG_CLASS[p.imgKey] ?? IMG_CLASS.rewild
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md"
    >
      <div className={cn('relative aspect-[16/8] overflow-hidden', !p.coverImageUrl && imgClass)}>
        {p.coverImageUrl && (
          <Image
            src={p.coverImageUrl}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        <span className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fg-primary backdrop-blur-sm">
            {p.type}
          </span>
          <ProjectStatusBadge status={p.status} className="bg-blue-900/85 backdrop-blur-sm" />
        </span>
        {p.needs > 0 && (
          <span className="absolute right-3 top-3 flex items-center gap-[5px] rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[11px] font-semibold text-amber-500 backdrop-blur-sm">
            <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500)]" />
            {p.needs} need{p.needs === 1 ? 's' : ''} help
          </span>
        )}
        {p.membersOnly && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-amber-500/35 bg-blue-900/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400 backdrop-blur-sm">
            <Lock className="size-2.5" />
            Members only
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-xs text-fg-tertiary">
          <MapPin className="size-3 shrink-0" />
          {p.location}
          <span className="mx-1 text-neutral-600">·</span>
          Posted {p.posted}
          {p.org && (
            <>
              <span className="mx-1 text-neutral-600">·</span>
              <span className="truncate text-fg-secondary">{p.org.name}</span>
            </>
          )}
        </div>
        <h3 className="font-display text-xl leading-snug">{p.title}</h3>
        <p className="line-clamp-2 text-sm leading-normal text-fg-secondary">{p.description}</p>
        {p.skills.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {p.skills.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-[3px] text-[11px] text-fg-secondary"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-fg-tertiary">
          <span>
            <strong className="font-semibold text-fg-primary">{p.contributors}</strong> contributor{p.contributors === 1 ? '' : 's'}
          </span>
          <div className="mx-3 h-[3px] max-w-[120px] flex-1 overflow-hidden rounded-sm bg-bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${p.progress}%` }}
            />
          </div>
          <span>
            <strong className="font-semibold text-fg-primary">{p.progress}%</strong> complete
          </span>
        </div>
      </div>
    </Link>
  )
}

function ProjectListRow({ project: p }: { project: BrowseProject }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className="flex items-center gap-5 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 transition-all duration-standard hover:-translate-y-px hover:border-neutral-600 hover:shadow-md"
    >
      <div className={cn('relative size-16 shrink-0 overflow-hidden rounded-xl', IMG_CLASS[p.imgKey] ?? IMG_CLASS.rewild)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-fg-tertiary">
          <span className="rounded-full border border-neutral-700 bg-bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fg-primary">
            {p.type}
          </span>
          <ProjectStatusBadge status={p.status} />
          <MapPin className="size-3 shrink-0" />
          {p.location}
          <span className="mx-1 text-neutral-600">·</span>
          {p.posted}
          {p.org && (
            <>
              <span className="mx-1 text-neutral-600">·</span>
              <span className="truncate text-fg-secondary">{p.org.name}</span>
            </>
          )}
          {p.membersOnly && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              <Lock className="size-2.5" />
              Members only
            </span>
          )}
        </div>
        <h3 className="truncate font-display text-lg">{p.title}</h3>
        <p className="line-clamp-1 text-sm text-fg-secondary">{p.description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-fg-tertiary">
        {p.needs > 0 && (
          <span className="flex items-center gap-1.5 font-semibold text-amber-500">
            <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500)]" />
            {p.needs} need{p.needs === 1 ? 's' : ''} help
          </span>
        )}
        <span><strong className="font-semibold text-fg-primary">{p.progress}%</strong> complete</span>
        <span>{p.contributors} contributor{p.contributors === 1 ? '' : 's'}</span>
      </div>
    </Link>
  )
}
