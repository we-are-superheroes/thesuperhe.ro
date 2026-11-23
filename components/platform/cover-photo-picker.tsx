'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  searchCoverPhotosAction,
  setCoverFromStockPhotoAction,
} from '@/app/(platform)/projects/[id]/edit/actions'
import type { StockPhoto } from '@/lib/pixabay'

/* ================================================================
   "Search photos" dialog for the project cover card. Searches free
   stock photos (Pixabay) through a server action; picking one copies
   it into our own storage and sets it as the cover.

   Pixabay asks that search results say where they come from — the
   "Photos from Pixabay" line and the per-photo author links do that.
   ================================================================ */

export function CoverPhotoPicker({
  projectId,
  onPicked,
  onClose,
}: {
  projectId: string
  /** Called with the new cover's URL once the photo is saved. */
  onPicked: (url: string) => void
  onClose: () => void
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')

  const [query, setQuery] = useState('')
  /** null = nothing searched yet. */
  const [photos, setPhotos] = useState<StockPhoto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [searching, startSearch] = useTransition()
  const [saving, startSave] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = searching || saving
  const canSearch = query.trim().length >= 2 && !busy

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // This form sits inside the page's edit form in the React tree.
    e.stopPropagation()
    if (!canSearch) return
    setError(null)
    startSearch(async () => {
      const result = await searchCoverPhotosAction(projectId, query)
      if (!result.success) setError(result.error)
      else setPhotos(result.data.photos)
    })
  }

  const onPick = (photo: StockPhoto) => {
    if (busy) return
    setError(null)
    setSavingId(photo.id)
    startSave(async () => {
      const result = await setCoverFromStockPhotoAction(projectId, photo.id)
      setSavingId(null)
      if (!result.success) setError(result.error)
      else onPicked(result.data.url)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-photo-picker-title"
    >
      <button
        type="button"
        aria-label={tCommon('actions.close')}
        onClick={() => !saving && onClose()}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-[760px] flex-col rounded-t-2xl border border-white/[0.08] bg-bg-surface shadow-xl sm:rounded-2xl">
        <div className="border-b border-white/[0.08] p-5 sm:p-6">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="absolute right-4 top-4 cursor-pointer text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label={tCommon('actions.close')}
          >
            <X className="size-4" />
          </button>
          <h2 id="cover-photo-picker-title" className="mb-1 pr-8 font-display text-2xl leading-tight">
            {t('form.cover.picker.title')}
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-fg-secondary">
            {t('form.cover.picker.desc')}
          </p>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder={t('form.cover.picker.placeholder')}
              aria-label={t('form.cover.search')}
              className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-bg-base px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-tertiary focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!canSearch}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-medium text-fg-on-accent transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search className="size-3.5" />
              {searching ? t('form.cover.picker.searching') : t('form.cover.picker.submit')}
            </button>
          </form>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto p-5 sm:p-6" aria-live="polite">
          {photos === null ? (
            <p className="text-sm leading-relaxed text-fg-tertiary">
              {t('form.cover.picker.start')}
            </p>
          ) : photos.length === 0 ? (
            <p className="text-sm leading-relaxed text-fg-tertiary">
              {t('form.cover.picker.empty')}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <li key={photo.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onPick(photo)}
                    disabled={busy}
                    aria-label={t('form.cover.picker.usePhoto', { name: photo.author })}
                    className={cn(
                      'relative aspect-[16/8] cursor-pointer overflow-hidden rounded-lg border border-white/[0.08] bg-bg-base transition-all hover:border-amber-500 focus-visible:border-amber-500 focus-visible:outline-none disabled:cursor-wait',
                      busy && savingId !== photo.id && 'opacity-50',
                    )}
                  >
                    {/* Temporary Pixabay-hosted thumbnail: shown only while
                        choosing, so it must not go through next/image (which
                        would cache a copy on our side). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {savingId === photo.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 px-2 text-center text-xs font-medium text-fg-primary">
                        {t('form.cover.picker.saving')}
                      </span>
                    )}
                  </button>
                  <a
                    href={photo.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs text-fg-tertiary transition-colors hover:text-fg-primary"
                  >
                    {t('form.cover.picker.by', { name: photo.author })}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/[0.08] px-5 py-3 text-xs leading-relaxed text-fg-tertiary sm:px-6">
          {t.rich('form.cover.picker.credit', {
            link: (chunks) => (
              <a
                href="https://pixabay.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-secondary underline hover:text-fg-primary"
              >
                {chunks}
              </a>
            ),
          })}{' '}
          {t('form.cover.picker.notice')}
        </div>
      </div>
    </div>
  )
}
