'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  requestOrganisationAction,
  uploadOrgImageAction,
} from '@/app/(platform)/orgs/actions'

/* ================================================================
   /orgs/request — gated organisation creation (spec F1). The form
   creates a `pending` org with the requester as its creator; a
   human approves it (and confirms free vs paid) before it goes
   live. No self-serve path exists on purpose.
   ================================================================ */

const TYPES = [
  {
    value: 'nonprofit' as const,
    label: 'Non-profit or community group',
    description:
      'Associations, cooperatives, schools, community groups. Free — the test is whether the organisation exists to make a profit for its owners.',
  },
  {
    value: 'company' as const,
    label: 'Company',
    description:
      'Businesses that want employees contributing on work time, with contribution reporting. Paid — we will contact you about pricing.',
  },
]

export function OrgRequestForm() {
  const [name, setName] = useState('')
  const [type, setType] = useState<'nonprofit' | 'company'>('nonprofit')
  const [website, setWebsite] = useState('')
  const [intendedUse, setIntendedUse] = useState('')
  const [listed, setListed] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageWarning, setImageWarning] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await requestOrganisationAction({
        name,
        type,
        website,
        intendedUse,
        listed,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      // The requester is the org's creator, so they may upload its images
      // straight away. A failed upload doesn't fail the request.
      const warnings: string[] = []
      for (const [image, file] of [
        ['logo', logoFile],
        ['banner', bannerFile],
      ] as const) {
        if (!file) continue
        const fd = new FormData()
        fd.set('file', file)
        const up = await uploadOrgImageAction(result.data.orgId, image, fd)
        if (!up.success) warnings.push(`The ${image} was not saved: ${up.error}`)
      }
      setImageWarning(warnings.length > 0 ? warnings.join(' ') : null)
      setDone(result.data.slug)
    })
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface px-8 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/[0.1] text-emerald-300">
          <Check className="size-6" />
        </div>
        <h2 className="font-display text-2xl font-normal">Request sent.</h2>
        <p className="max-w-[460px] text-sm leading-relaxed text-fg-secondary">
          We review every organisation by hand — usually within a few days. Until then, only you
          can see{' '}
          <Link href={`/orgs/${done}`} className="text-amber-500 hover:underline">
            your organisation page
          </Link>
          . We will contact you by email if we have questions.
        </p>
        {imageWarning && <p className="max-w-[460px] text-sm text-amber-400">{imageWarning}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface p-6 sm:p-8">
      <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        Organisation name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hackney Rewilders"
          className="rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-base text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
        />
      </label>

      <div className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        What kind of organisation is it?
        <div role="radiogroup" aria-label="Organisation type" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TYPES.map((opt) => {
            const checked = type === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setType(opt.value)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border bg-bg-base p-4 text-left transition-colors',
                  checked
                    ? 'border-amber-500/40 bg-amber-500/[0.06]'
                    : 'border-neutral-700 hover:border-neutral-600',
                )}
              >
                <span className={cn('text-sm font-medium', checked ? 'text-amber-500' : 'text-fg-primary')}>
                  {opt.label}
                </span>
                <span className="text-xs leading-relaxed text-fg-tertiary">{opt.description}</span>
              </button>
            )
          })}
        </div>
        <span className="mt-1 text-xs text-fg-tertiary">
          We confirm the type during review — the legal form matters less than whether the
          organisation exists to make a profit.
        </span>
      </div>

      <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        Website (optional)
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="example.org"
          className="rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        How do you plan to use it?
        <textarea
          value={intendedUse}
          onChange={(e) => setIntendedUse(e.target.value)}
          rows={4}
          placeholder="A sentence or two: who you are, and what your organisation would do here."
          className="rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
        />
        <span className="mt-1 text-xs text-fg-tertiary">
          This becomes the first draft of your organisation&rsquo;s About text — you can change it
          any time.
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FilePick
          label="Logo (optional)"
          hint="Square works best."
          file={logoFile}
          onFile={setLogoFile}
        />
        <FilePick
          label="Banner (optional)"
          hint="Wide image, about 1600×400."
          file={bannerFile}
          onFile={setBannerFile}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-700 bg-bg-base px-3.5 py-3">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
          className="mt-0.5 size-4 accent-amber-500"
        />
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium text-fg-primary">List in the directory once approved</span>
          <span className="text-xs leading-relaxed text-fg-tertiary">
            Listed organisations appear on the Organisations page for everyone. You can change
            this any time.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim() || !intendedUse.trim()}
        className="cursor-pointer self-start rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-5 py-2.5 text-sm font-semibold text-amber-950 transition-transform hover:-translate-y-px disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send request'}
      </button>
    </div>
  )
}

/** Small file picker row: choose / replace / clear, nothing uploads yet. */
function FilePick({
  label,
  hint,
  file,
  onFile,
}: {
  label: string
  hint: string
  file: File | null
  onFile: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-1.5 text-sm text-fg-secondary">
      {label}
      <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-bg-base px-3.5 py-3">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-tertiary">
          {file ? file.name : 'No file chosen'}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-full border border-neutral-700 px-3 py-1 text-xs text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
        >
          {file ? 'Replace' : 'Choose file'}
        </button>
        {file && (
          <button
            type="button"
            onClick={() => onFile(null)}
            className="cursor-pointer rounded-full border border-neutral-700 px-3 py-1 text-xs text-fg-tertiary transition-colors hover:border-red-400/50 hover:text-red-400"
          >
            Clear
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <span className="text-xs text-fg-tertiary">{hint}</span>
    </div>
  )
}
