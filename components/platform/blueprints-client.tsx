'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  Zap,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectBox } from '@/components/platform/project-form-bits'
import {
  countryFlag,
  countryLabel,
  languageDisplay,
  languageLabel,
} from '@/lib/locales'

/* ================================================================
   Blueprint catalog client. Renders a filter sidebar (Type +
   Country + Language) and a grid of family cards. Each card shows
   one variant at a time; clicking a chip swaps the visible variant.
   ================================================================ */

export interface BlueprintVariantOption {
  id: string
  title: string
  description: string
  country: string | null
  language: string | null
  reuseCount: number
  stepCount: number
  isRoot: boolean
}

export interface BlueprintFamily {
  id: string
  title: string
  tagline: string
  description: string
  projectTypeId: string | null
  projectTypeName: string | null
  totalReuse: number
  stepCount: number
  addedAt: number
  variants: BlueprintVariantOption[]
}

interface FilterOption {
  id: string
  name: string
  count: number
}
interface CodeOption {
  code: string
  label: string
  count: number
}

type SortKey = 'popular' | 'recent' | 'variants' | 'az'

export function BlueprintsClient({
  families,
  types,
  countries,
  languages,
  stats,
}: {
  families: BlueprintFamily[]
  types: FilterOption[]
  countries: CodeOption[]
  languages: CodeOption[]
  stats: { familyCount: number; variantCount: number; launchCount: number }
}) {
  const [query, setQuery] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(),
  )
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(
    new Set(),
  )
  const [sort, setSort] = useState<SortKey>('popular')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [pickedVariant, setPickedVariant] = useState<Record<string, string>>({})

  // A variant passes locale filters if (no filter is set OR it's in the set).
  const variantMatches = (v: BlueprintVariantOption) => {
    if (selectedCountries.size && (!v.country || !selectedCountries.has(v.country))) {
      return false
    }
    if (
      selectedLanguages.size &&
      (!v.language || !selectedLanguages.has(v.language))
    ) {
      return false
    }
    return true
  }

  const familyMatches = (fam: BlueprintFamily) => {
    if (selectedTypes.size) {
      if (!fam.projectTypeId || !selectedTypes.has(fam.projectTypeId)) return false
    }
    if (selectedCountries.size || selectedLanguages.size) {
      if (!fam.variants.some(variantMatches)) return false
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      const hay = [
        fam.title,
        fam.tagline,
        fam.description,
        fam.projectTypeName ?? '',
        ...fam.variants.map((v) =>
          [
            v.title,
            v.description,
            countryLabel(v.country) ?? '',
            languageLabel(v.language) ?? '',
          ].join(' '),
        ),
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }

  const visible = useMemo(() => {
    const list = families.filter(familyMatches)
    list.sort((a, b) => {
      if (sort === 'popular') return b.totalReuse - a.totalReuse
      if (sort === 'recent') return b.addedAt - a.addedAt
      if (sort === 'variants') return b.variants.length - a.variants.length
      return a.title.localeCompare(b.title)
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families, query, selectedTypes, selectedCountries, selectedLanguages, sort])

  const visibleCountries = countries.filter((c) =>
    c.label.toLowerCase().includes(countrySearch.trim().toLowerCase()),
  )

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSet(next)
  }

  const clearAll = () => {
    setQuery('')
    setCountrySearch('')
    setSelectedTypes(new Set())
    setSelectedCountries(new Set())
    setSelectedLanguages(new Set())
  }

  const activeChips: Array<{ kind: string; key: string; label: string }> = []
  if (query.trim()) activeChips.push({ kind: 'query', key: '', label: `"${query.trim()}"` })
  for (const id of selectedTypes) {
    const t = types.find((x) => x.id === id)
    if (t) activeChips.push({ kind: 'type', key: id, label: t.name })
  }
  for (const code of selectedCountries) {
    const c = countries.find((x) => x.code === code)
    if (c) activeChips.push({ kind: 'country', key: code, label: c.label })
  }
  for (const code of selectedLanguages) {
    const l = languages.find((x) => x.code === code)
    if (l) activeChips.push({ kind: 'language', key: code, label: l.label })
  }
  const removeChip = (kind: string, key: string) => {
    if (kind === 'query') setQuery('')
    else if (kind === 'type') toggle(selectedTypes, setSelectedTypes, key)
    else if (kind === 'country') toggle(selectedCountries, setSelectedCountries, key)
    else if (kind === 'language') toggle(selectedLanguages, setSelectedLanguages, key)
  }

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
            placeholder="Search blueprints..."
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Save your own blueprint</span>
            <span className="sm:hidden">New</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
        {/* Header */}
        <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
              Blueprint library
            </div>
            <h1 className="font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
              Start from a <em className="italic text-amber-500">proven</em> pattern.
            </h1>
            <p className="mt-3 max-w-[640px] text-base leading-relaxed text-fg-secondary sm:text-lg">
              Blueprints are tested project recipes — born in one place, adapted
              for others. Pick a model that fits your context, your country and
              your language; we&apos;ll set the rest up around it.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 sm:w-auto">
            <Stat value={stats.familyCount} label="Families" />
            <Stat value={stats.variantCount} label="Variants" />
            <Stat value={stats.launchCount} label="Launches" dimIfZero />
          </div>
        </section>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((o) => !o)}
          className="inline-flex w-fit items-center gap-2 self-start rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary lg:hidden"
        >
          <SlidersHorizontal className="size-4" />
          {mobileFiltersOpen ? 'Hide filters' : 'Show filters'}
        </button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          {/* Filters */}
          <aside
            className={cn(
              'flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto',
              mobileFiltersOpen ? 'flex' : 'hidden lg:flex',
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-normal">Filters</h3>
              {activeChips.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-fg-tertiary underline-offset-2 hover:text-fg-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {types.length > 0 && (
              <FilterGroup label="Type">
                <CheckList
                  items={types.map((t) => ({ id: t.id, label: t.name, count: t.count }))}
                  selected={selectedTypes}
                  onToggle={(k) => toggle(selectedTypes, setSelectedTypes, k)}
                />
              </FilterGroup>
            )}

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-fg-secondary">
                Showing <strong className="font-semibold text-fg-primary">{visible.length}</strong>{' '}
                of {families.length} blueprint{families.length === 1 ? '' : 's'}
              </div>
              <SelectBox
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto cursor-pointer bg-bg-surface py-2 pl-3 pr-8 [background-position:right_10px_center]"
              >
                <option value="popular">Most used</option>
                <option value="recent">Recently added</option>
                <option value="variants">Most variants</option>
                <option value="az">A–Z</option>
              </SelectBox>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeChips.map((chip) => (
                  <span
                    key={`${chip.kind}:${chip.key}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1 text-xs text-amber-500"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-amber-500/70">
                      {chip.kind === 'query' ? 'search' : chip.kind}
                    </span>
                    <span className="font-medium text-amber-500">{chip.label}</span>
                    <button
                      type="button"
                      onClick={() => removeChip(chip.kind, chip.key)}
                      className="text-amber-500/70 hover:text-amber-500"
                      title="Remove filter"
                    >
                      <X className="size-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
                <h3 className="font-display text-2xl">No blueprints match.</h3>
                <p className="mx-auto mt-2 max-w-[460px] text-base leading-relaxed text-fg-secondary">
                  Loosen a filter, or save the first blueprint that fits this niche
                  yourself.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((fam) => (
                  <FamilyCard
                    key={fam.id}
                    family={fam}
                    pickedVariantId={pickedVariant[fam.id]}
                    onPickVariant={(vid) =>
                      setPickedVariant((prev) => ({ ...prev, [fam.id]: vid }))
                    }
                    isVariantDim={(v) =>
                      (selectedCountries.size > 0 || selectedLanguages.size > 0) &&
                      !variantMatches(v)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Card ────────────────────────────────────────────────────── */

function FamilyCard({
  family,
  pickedVariantId,
  onPickVariant,
  isVariantDim,
}: {
  family: BlueprintFamily
  pickedVariantId: string | undefined
  onPickVariant: (variantId: string) => void
  isVariantDim: (v: BlueprintVariantOption) => boolean
}) {
  // Prefer the user's pick; otherwise the first variant that doesn't fall
  // outside the active filters; otherwise the root.
  const focused: BlueprintVariantOption =
    family.variants.find((v) => v.id === pickedVariantId) ??
    family.variants.find((v) => !isVariantDim(v)) ??
    family.variants[0]

  return (
    <article className="flex flex-col rounded-2xl border border-white/[0.08] bg-bg-surface p-5 transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md">
      {/* Head */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          {family.projectTypeName && (
            <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
              {family.projectTypeName}
            </span>
          )}
          <Link
            href={`/blueprints/${focused.id}`}
            className="font-display text-2xl leading-tight transition-colors hover:text-amber-500"
          >
            {family.title}
          </Link>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {family.variants.length} variant{family.variants.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-fg-secondary">{family.tagline}</p>

      {/* Focused-variant blurb */}
      {(focused.country || focused.language) && (
        <p className="mt-3 text-sm leading-snug text-fg-primary">
          <strong className="font-semibold">
            {[countryLabel(focused.country), languageLabel(focused.language)]
              .filter(Boolean)
              .join(' · ')}
            .
          </strong>{' '}
          {focused.id === family.id
            ? 'The original recipe — adapt it for your area.'
            : truncate(focused.description, 180)}
        </p>
      )}

      {/* Variant chips */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
          Available in
        </div>
        <div className="flex flex-wrap gap-1.5">
          {family.variants.map((v) => (
            <VariantChip
              key={v.id}
              variant={v}
              selected={v.id === focused.id}
              dim={isVariantDim(v)}
              onClick={() => onPickVariant(v.id)}
            />
          ))}
        </div>
      </div>

      {/* Foot */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-fg-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-3.5" />
            <strong className="font-semibold text-fg-primary">{family.totalReuse}</strong>
            launch{family.totalReuse === 1 ? '' : 'es'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {family.stepCount} step{family.stepCount === 1 ? '' : 's'}
          </span>
        </div>
        <Link
          href={`/projects/new?blueprint=${focused.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-amber-900 transition-all hover:bg-amber-400"
        >
          Use blueprint
          <ArrowRight className="size-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </article>
  )
}

function VariantChip({
  variant,
  selected,
  dim,
  onClick,
}: {
  variant: BlueprintVariantOption
  selected: boolean
  dim: boolean
  onClick: () => void
}) {
  const country = variant.country
  const lang = variant.language
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        [countryLabel(country), languageLabel(lang)].filter(Boolean).join(' · ') ||
        'Locale not set'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-all',
        selected
          ? 'border-amber-500 bg-amber-500/[0.14] text-amber-500'
          : 'border-white/[0.12] bg-bg-surface-2 text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
        dim && !selected && 'opacity-40',
      )}
    >
      {country ? (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>{countryFlag(country) ?? '🌐'}</span>
          <span className="font-mono text-[10px] tracking-wider">{country}</span>
        </span>
      ) : (
        <span className="font-mono text-[10px] tracking-wider text-fg-tertiary">—</span>
      )}
      {lang && (
        <span className="rounded-full bg-white/[0.06] px-1.5 py-px font-mono text-[10px] tracking-wider">
          {languageDisplay(lang) ?? lang.toUpperCase()}
        </span>
      )}
      {variant.isRoot && (
        <span className="text-[9px] uppercase tracking-widest text-fg-tertiary">
          original
        </span>
      )}
    </button>
  )
}

/* ── Filter helpers (shared with browse-projects) ───────────── */

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
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
  onChange: (s: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-9 py-2 text-xs text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
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
  return (
    <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto pr-1">
      {items.map((item) => {
        const checked = selected.has(item.id)
        return (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(item.id)}
              className="hidden"
            />
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors',
                checked
                  ? 'border-amber-500 bg-amber-500 text-amber-900'
                  : 'border-neutral-700 bg-transparent',
              )}
            >
              {checked && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto text-[11px] tabular-nums text-fg-tertiary">
              {item.count}
            </span>
          </label>
        )
      })}
      {items.length === 0 && (
        <div className="px-1.5 py-2 text-xs text-fg-tertiary">No matches.</div>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  dimIfZero,
}: {
  value: number
  label: string
  dimIfZero?: boolean
}) {
  const dim = dimIfZero && value === 0
  return (
    <div>
      <div
        className={cn(
          'font-display text-2xl leading-none',
          dim ? 'text-fg-tertiary' : 'text-amber-500',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
    </div>
  )
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…'
}
