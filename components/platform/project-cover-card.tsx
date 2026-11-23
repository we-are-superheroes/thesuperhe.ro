'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { ImageIcon, Search, Upload } from 'lucide-react'
import { Card, CardHead } from '@/components/platform/project-form-bits'
import { CoverPhotoPicker } from '@/components/platform/cover-photo-picker'
import type { StockPhoto } from '@/lib/pixabay'

/* ================================================================
   The "Cover image" card shared by the create- and edit-project
   forms: preview, upload, stock-photo search and remove.

   The card only reports what the user chose. The edit form saves the
   choice straight away; the create form keeps it until the project
   exists (a cover needs a project to belong to).
   ================================================================ */

export function ProjectCoverCard({
  id,
  previewUrl,
  plainPreview = false,
  pending,
  photoSearchEnabled,
  onFile,
  onStockPhoto,
  onRemove,
}: {
  /** Anchor id for the edit form's "On this page" list. */
  id?: string
  previewUrl: string | null
  /** True for previews that are not in our storage yet (a local file or a
   *  temporary stock-photo thumbnail) — those must not go through next/image. */
  plainPreview?: boolean
  /** A cover change is being saved. */
  pending: boolean
  /** Stock-photo search is offered only where its API key is configured. */
  photoSearchEnabled: boolean
  onFile: (file: File) => void
  /** Resolves to an error message, or null when the photo was accepted. */
  onStockPhoto: (photo: StockPhoto) => Promise<string | null>
  onRemove: () => void
}) {
  const t = useTranslations('project')
  const fileRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const outlineBtn =
    'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-fg-primary transition-colors hover:border-neutral-600 disabled:cursor-wait disabled:opacity-60'

  return (
    <Card id={id}>
      <CardHead
        eyebrow={t('form.cover.eyebrow')}
        title={t('form.cover.title')}
        desc={t('form.cover.desc')}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Let the same file be chosen again after a remove.
          e.target.value = ''
        }}
      />
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative aspect-[16/8] w-full max-w-[260px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-bg-base">
          {previewUrl && plainPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={t('form.cover.alt')} className="size-full object-cover" />
          ) : previewUrl ? (
            <Image
              src={previewUrl}
              alt={t('form.cover.alt')}
              fill
              sizes="260px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fg-tertiary">
              <ImageIcon className="size-8" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className={outlineBtn}
            >
              <Upload className="size-3.5" />
              {pending
                ? t('form.cover.uploading')
                : previewUrl
                  ? t('form.cover.replace')
                  : t('form.cover.upload')}
            </button>
            {photoSearchEnabled && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={pending}
                className={outlineBtn}
              >
                <Search className="size-3.5" />
                {t('form.cover.search')}
              </button>
            )}
            {previewUrl && (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-red-300 transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-60"
              >
                {t('form.cover.remove')}
              </button>
            )}
          </div>
          <span className="max-w-[320px] text-xs leading-relaxed text-fg-tertiary">
            {t('form.cover.hint')}
          </span>
        </div>
      </div>
      {pickerOpen && (
        <CoverPhotoPicker
          onChoose={async (photo) => {
            const problem = await onStockPhoto(photo)
            if (!problem) setPickerOpen(false)
            return problem
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Card>
  )
}
