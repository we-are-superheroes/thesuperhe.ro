'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, Plus, X, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveProfileAction, clearAvatarAction } from '@/app/(platform)/profile/actions'
import type { Proficiency } from '@/types'

/* ================================================================
   Types
   ================================================================ */

export interface SkillOption {
  id: string
  name: string
  category: string
}

interface FormSkill {
  skillId: string
  name: string
  category: string
  proficiency: Proficiency
  isSeeking: boolean
}

export interface ProfileFormInitial {
  name: string
  email: string
  bio: string
  location: string
  timezone: string
  avatarUrl: string | null
  skills: FormSkill[]
}

const LEVELS: Array<{ value: Proficiency; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
]

const SUGGESTION_NAMES = [
  'Photography',
  'Translation / interpretation',
  'Data analysis',
  'Community organising',
  'Grant writing',
  'Architecture',
  'Legal research',
]

const BIO_MAX = 400

/* ================================================================
   Component
   ================================================================ */

export function ProfileEditForm({
  initial,
  skillOptions,
  timezones,
}: {
  initial: ProfileFormInitial
  skillOptions: SkillOption[]
  timezones: string[]
}) {
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [location, setLocation] = useState(initial.location)
  const [timezone, setTimezone] = useState(initial.timezone || timezones[3] || '')
  const [skills, setSkills] = useState<FormSkill[]>(initial.skills)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl)
  const [skillAddInput, setSkillAddInput] = useState('')
  const [selectedAddSkill, setSelectedAddSkill] = useState<SkillOption | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const browseRef = useRef<HTMLDivElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Track baseline so we can show "Unsaved changes"
  const baselineRef = useRef({
    name: initial.name,
    bio: initial.bio,
    location: initial.location,
    timezone: initial.timezone || timezones[3] || '',
    skills: JSON.stringify(initial.skills),
  })
  const isDirty =
    name !== baselineRef.current.name ||
    bio !== baselineRef.current.bio ||
    location !== baselineRef.current.location ||
    timezone !== baselineRef.current.timezone ||
    JSON.stringify(skills) !== baselineRef.current.skills

  const addedSkillIds = useMemo(() => new Set(skills.map((s) => s.skillId)), [skills])

  // Full catalogue minus the skills already on the profile.
  const availableSkills = useMemo(
    () => skillOptions.filter((s) => !addedSkillIds.has(s.id)),
    [skillOptions, addedSkillIds],
  )

  // Top 10 matches for the current search term, ranked by closeness.
  // Lower score = better match.
  const searchMatches = useMemo(() => {
    const q = skillAddInput.trim().toLowerCase()
    if (!q) return [] as SkillOption[]
    const scored: Array<{ skill: SkillOption; score: number }> = []
    for (const s of availableSkills) {
      const name = s.name.toLowerCase()
      const cat = s.category.toLowerCase()
      let score = Infinity
      if (name === q) score = 0
      else if (name.startsWith(q)) score = 10 + (name.length - q.length)
      else if (name.includes(q)) score = 100 + name.indexOf(q)
      else if (cat.startsWith(q)) score = 1000
      else if (cat.includes(q)) score = 1100 + cat.indexOf(q)
      if (score !== Infinity) scored.push({ skill: s, score })
    }
    scored.sort((a, b) =>
      a.score !== b.score ? a.score - b.score : a.skill.name.localeCompare(b.skill.name),
    )
    return scored.slice(0, 10).map(({ skill }) => skill)
  }, [availableSkills, skillAddInput])

  const suggestions = useMemo(() => {
    return SUGGESTION_NAMES.map((n) => skillOptions.find((s) => s.name === n))
      .filter((s): s is SkillOption => !!s)
      .filter((s) => !addedSkillIds.has(s.id))
      .slice(0, 7)
  }, [skillOptions, addedSkillIds])

  // Close the search dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const onDown = (e: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dropdownOpen])

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }, [name])

  /* ── Handlers ───────────────────────────────────────── */

  const addSkill = (option: SkillOption) => {
    if (addedSkillIds.has(option.id)) return
    setSkills((prev) => [
      ...prev,
      {
        skillId: option.id,
        name: option.name,
        category: option.category,
        proficiency: 'intermediate',
        isSeeking: true,
      },
    ])
    setSkillAddInput('')
    setSelectedAddSkill(null)
    setDropdownOpen(false)
  }

  const selectAddSkill = (option: SkillOption) => {
    setSelectedAddSkill(option)
    setSkillAddInput(option.name)
    setDropdownOpen(false)
  }

  const removeSkill = (skillId: string) => {
    setSkills((prev) => prev.filter((s) => s.skillId !== skillId))
  }

  const setSkillLevel = (skillId: string, proficiency: Proficiency) => {
    setSkills((prev) => prev.map((s) => (s.skillId === skillId ? { ...s, proficiency } : s)))
  }

  const setSkillSeeking = (skillId: string, isSeeking: boolean) => {
    setSkills((prev) => prev.map((s) => (s.skillId === skillId ? { ...s, isSeeking } : s)))
  }

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await saveProfileAction({
        name,
        bio,
        location,
        timezone,
        skills: skills.map((s) => ({
          skillId: s.skillId,
          proficiency: s.proficiency,
          isSeeking: s.isSeeking,
        })),
      })
      if (!result.success) {
        setError(result.error)
      } else {
        baselineRef.current = {
          name,
          bio,
          location,
          timezone,
          skills: JSON.stringify(skills),
        }
        setSavedAt(new Date())
      }
    })
  }

  const removeAvatar = () => {
    setError(null)
    startTransition(async () => {
      const result = await clearAvatarAction()
      if (!result.success) setError(result.error)
      else setAvatarUrl(null)
    })
  }

  /* ── Render ─────────────────────────────────────────── */

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-white/[0.08] bg-bg-base px-10 py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link href="/dashboard" className="transition-colors duration-fast hover:text-fg-primary">
            Dashboard
          </Link>
          <span className="opacity-50">/</span>
          <span className="font-medium text-fg-primary">Edit profile</span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-300">{error}</span>}
          {!error && isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-fg-tertiary">
              <span className="size-[7px] animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_var(--color-amber-500)]" />
              Unsaved changes
            </span>
          )}
          {!error && savedAt && !isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-fg-tertiary">
              <span className="size-[7px] rounded-full bg-green-500 shadow-[0_0_6px_var(--color-green-500)]" />
              Saved just now
            </span>
          )}
          <button
            type="submit"
            disabled={pending || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[220px_1fr] items-start gap-12 p-10">
        {/* Page header */}
        <header className="col-span-2 mb-4 flex items-end justify-between gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">profile</em>.
            </h1>
            <p className="max-w-[540px] text-lg leading-relaxed text-fg-secondary">
              This is what project leads see when you raise your hand. Make it real — the more honest, the better the matches.
            </p>
          </div>
        </header>

        {/* TOC */}
        <nav className="sticky top-[110px] flex flex-col gap-0.5" aria-label="Profile sections">
          <span className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            On this page
          </span>
          <TocLink href="#sec-identity">About you</TocLink>
          <TocLink href="#sec-skills">Skills</TocLink>
          <TocLink href="#sec-where">Where & when</TocLink>
        </nav>

        {/* Sections */}
        <div className="flex flex-col gap-8">
          {/* About you */}
          <Card id="sec-identity">
            <CardHead
              eyebrow="About you"
              title="Tell your story."
              desc="A short bio and picture help project leads understand what drives you. What change do you want to be part of?"
            />
            <div className="flex flex-col gap-5">
              {/* Avatar */}
              <Field label="Profile picture">
                <div className="flex items-center gap-6">
                  <div
                    className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-bg-surface bg-gradient-to-br from-[#4a8b6e] to-[#3DAF7C] font-display text-[44px] text-blue-900 shadow-md after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
                    style={
                      avatarUrl
                        ? { background: `center/cover url(${avatarUrl})` }
                        : undefined
                    }
                  >
                    {!avatarUrl && initials}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled
                        title="Avatar upload coming soon"
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-fg-primary opacity-60"
                      >
                        <Upload className="size-3.5" />
                        Upload new
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={removeAvatar}
                          disabled={pending}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-red-300 transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <span className="max-w-[280px] text-xs leading-relaxed text-fg-tertiary">
                      Square, at least 256×256. PNG, JPG or WebP, up to 4&nbsp;MB. Upload coming soon.
                    </span>
                  </div>
                </div>
              </Field>

              <Field label="Full name" htmlFor="fld-name">
                <input
                  id="fld-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>

              <Field
                label="Bio"
                htmlFor="fld-bio"
                hint={
                  <span
                    className={cn(
                      'tabular-nums',
                      bio.length > BIO_MAX * 0.9 ? 'text-amber-500' : '',
                    )}
                  >
                    {bio.length} / {BIO_MAX}
                  </span>
                }
                help="Two or three sentences. What you care about, what you're working on, what you'd love to do more of."
              >
                <textarea
                  id="fld-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  maxLength={BIO_MAX}
                  rows={5}
                  placeholder="Two or three sentences. What you care about, what you're working on, what you'd love to do more of."
                  className="min-h-24 w-full resize-y rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm leading-relaxed text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>
            </div>
          </Card>

          {/* Skills */}
          <Card id="sec-skills">
            <CardHead
              eyebrow="Skills"
              title="What you bring."
              descNode={
                <>
                  Pick what you’re good at — and tell us whether you actually{' '}
                  <em className="italic text-amber-500">want</em> projects that need it. It’s fine to be expert at something you’re done with.
                </>
              }
            />

            {/* Skills table */}
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-bg-base">
              {skills.length > 0 && (
                <div className="grid grid-cols-[1fr_320px_130px_32px] gap-4 border-b border-white/[0.08] bg-bg-surface-2 px-5 py-3.5 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                  <span>Skill</span>
                  <span>Level</span>
                  <span className="text-center">Match me</span>
                  <span />
                </div>
              )}
              <div>
                {skills.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-fg-tertiary">
                    No skills yet — add some below or pick from the suggestions.
                  </div>
                ) : (
                  skills.map((s) => (
                    <SkillRow
                      key={s.skillId}
                      skill={s}
                      onLevel={(p) => setSkillLevel(s.skillId, p)}
                      onSeeking={(v) => setSkillSeeking(s.skillId, v)}
                      onRemove={() => removeSkill(s.skillId)}
                    />
                  ))
                )}
              </div>

              {/* Add a skill — typeahead with dropdown */}
              <div
                ref={browseRef}
                className="relative border-t border-white/[0.08] bg-bg-surface-2 px-5 py-4"
              >
                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
                    <input
                      type="text"
                      value={skillAddInput}
                      onChange={(e) => {
                        setSkillAddInput(e.target.value)
                        setSelectedAddSkill(null)
                        setDropdownOpen(true)
                      }}
                      onFocus={() => {
                        if (skillAddInput.trim()) setDropdownOpen(true)
                      }}
                      placeholder={
                        availableSkills.length === 0
                          ? 'You’ve added every skill in our catalogue.'
                          : 'Add a skill — search by name or category…'
                      }
                      disabled={availableSkills.length === 0}
                      className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-9 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-amber-500 disabled:cursor-not-allowed"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const target = selectedAddSkill ?? searchMatches[0]
                          if (target) addSkill(target)
                        } else if (e.key === 'Escape') {
                          setDropdownOpen(false)
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedAddSkill ?? searchMatches[0]
                      if (target) addSkill(target)
                    }}
                    disabled={!selectedAddSkill && searchMatches.length === 0}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-amber-900 transition-all duration-fast hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    Add
                  </button>
                </div>

                {/* Match dropdown */}
                {dropdownOpen && skillAddInput.trim() && (
                  <div className="absolute inset-x-5 top-full z-20 mt-1 max-h-[360px] overflow-y-auto rounded-xl border border-white/[0.08] bg-bg-surface shadow-lg">
                    {searchMatches.length === 0 ? (
                      <div className="px-5 py-6 text-center text-sm text-fg-tertiary">
                        No skills in our catalogue match{' '}
                        <span className="text-fg-secondary">“{skillAddInput.trim()}”</span>.
                      </div>
                    ) : (
                      <div className="flex flex-col py-1">
                        {searchMatches.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectAddSkill(s)}
                            className={cn(
                              'group flex cursor-pointer items-center justify-between gap-3 px-5 py-2.5 text-left text-sm transition-colors',
                              selectedAddSkill?.id === s.id
                                ? 'bg-amber-500/[0.12] text-amber-500'
                                : 'text-fg-secondary hover:bg-bg-surface-2 hover:text-fg-primary',
                            )}
                          >
                            <span className="truncate">{s.name}</span>
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                selectedAddSkill?.id === s.id
                                  ? 'border-amber-500/40 text-amber-500'
                                  : 'border-white/[0.08] bg-bg-surface-3 text-fg-tertiary',
                              )}
                            >
                              {s.category}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Suggested chips */}
            {suggestions.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="mr-2 text-xs text-fg-tertiary">Suggestions:</span>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addSkill(s)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:border-amber-500 hover:text-amber-500"
                  >
                    <Plus className="size-3" strokeWidth={2.5} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Where & when */}
          <Card id="sec-where">
            <CardHead
              eyebrow="Where & when"
              title="Location & timezone."
              desc="Used to surface local projects and to coordinate calls. We never show your exact address — just your city."
            />
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-5">
                <Field label="City" htmlFor="fld-city">
                  <input
                    id="fld-city"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Lausanne, Switzerland"
                    className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                  />
                </Field>
                <Field label="Timezone" htmlFor="fld-timezone">
                  <select
                    id="fld-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </form>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="ml-1.5 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm text-fg-secondary transition-colors hover:text-fg-primary"
    >
      {children}
    </a>
  )
}

function Card({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-[110px] rounded-2xl border border-white/[0.08] bg-bg-surface p-8"
    >
      {children}
    </section>
  )
}

function CardHead({
  eyebrow,
  title,
  desc,
  descNode,
}: {
  eyebrow: string
  title: string
  desc?: string
  descNode?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
        {title}
      </h2>
      {(desc || descNode) && (
        <p className="mt-2 max-w-[540px] text-sm leading-relaxed text-fg-secondary">
          {descNode ?? desc}
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  help,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between text-sm font-medium text-fg-primary"
      >
        <span>{label}</span>
        {hint && <span className="text-xs text-fg-tertiary">{hint}</span>}
      </label>
      {children}
      {help && <span className="mt-0.5 text-xs text-fg-tertiary">{help}</span>}
    </div>
  )
}

function SkillRow({
  skill,
  onLevel,
  onSeeking,
  onRemove,
}: {
  skill: FormSkill
  onLevel: (p: Proficiency) => void
  onSeeking: (v: boolean) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_320px_130px_32px] items-center gap-4 border-b border-white/[0.08] px-5 py-4 transition-colors duration-fast last:border-b-0 hover:bg-bg-surface-2">
      <div className="flex items-center gap-3 text-sm font-medium text-fg-primary">
        {skill.name}
        <span className="rounded-full border border-white/[0.08] bg-bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary">
          {skill.category}
        </span>
      </div>

      {/* Level segmented control */}
      <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-neutral-700 bg-bg-surface p-[3px]">
        {LEVELS.map((l) => {
          const checked = skill.proficiency === l.value
          const checkedClass = (() => {
            if (!checked) return ''
            if (l.value === 'beginner')
              return 'bg-blue-500/[0.18] text-blue-300 shadow-[inset_0_0_0_1px_rgba(74,127,212,0.4)]'
            if (l.value === 'intermediate')
              return 'bg-blue-500/[0.28] text-blue-200 shadow-[inset_0_0_0_1px_rgba(74,127,212,0.55)]'
            return 'bg-amber-500/[0.18] text-amber-500 shadow-[inset_0_0_0_1px_rgba(244,165,53,0.5)]'
          })()
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => onLevel(l.value)}
              className={cn(
                'cursor-pointer rounded-md px-1 py-1.5 text-xs font-medium transition-all duration-fast',
                checked ? checkedClass : 'text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              {l.label}
            </button>
          )
        })}
      </div>

      {/* Seeking toggle */}
      <div className="flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={skill.isSeeking}
          onClick={() => onSeeking(!skill.isSeeking)}
          className={cn(
            'relative inline-block h-[22px] w-10 cursor-pointer rounded-full border transition-all duration-fast',
            skill.isSeeking
              ? 'border-amber-500 bg-amber-500/[0.18]'
              : 'border-neutral-700 bg-bg-surface-3',
          )}
          title={skill.isSeeking ? 'Looking for projects' : 'Not looking right now'}
        >
          <span
            className={cn(
              'absolute left-[2px] top-[2px] size-4 rounded-full transition-all duration-fast',
              skill.isSeeking
                ? 'translate-x-[18px] bg-amber-500 shadow-[0_0_8px_rgba(244,165,53,0.6)]'
                : 'translate-x-0 bg-fg-secondary',
            )}
          />
        </button>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-fg-tertiary transition-colors hover:bg-red-500/[0.12] hover:text-red-300"
        title="Remove skill"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
