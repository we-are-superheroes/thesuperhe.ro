'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import {
  deleteProjectAction,
  deleteBlueprintAction,
} from '@/app/(platform)/admin/actions'

/* ================================================================
   Admin-only delete control. Rendered only when the viewer is an
   admin (the server pages gate this), but the *authorization* lives
   in the server action — this button is just the trigger.

   A deliberate confirmation modal stands between a click and an
   irreversible delete.
   ================================================================ */

export function AdminDeleteButton({
  kind,
  id,
  name,
  redirectTo,
  variant = 'button',
}: {
  kind: 'project' | 'blueprint'
  id: string
  /** Shown in the confirmation so the admin sees exactly what they're deleting. */
  name: string
  /** Where to go after a successful delete. */
  redirectTo: string
  /** 'button' = labelled danger button; 'icon' = compact icon-only trigger. */
  variant?: 'button' | 'icon'
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    setError(null)
    startTransition(async () => {
      const result =
        kind === 'project'
          ? await deleteProjectAction(id)
          : await deleteBlueprintAction(id)
      if (!result.success) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.push(redirectTo)
      router.refresh()
    })
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t('adminDelete.triggerTitle', { kind })}
          aria-label={t('adminDelete.deleteKind', { kind })}
          className="inline-flex size-[38px] items-center justify-center rounded-lg border border-red-500/40 bg-red-500/[0.08] text-red-300 transition-colors hover:border-red-500 hover:bg-red-500/[0.16] hover:text-red-200"
        >
          <Trash2 className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:border-red-500 hover:bg-red-500/[0.16] hover:text-red-200 sm:px-4 sm:py-2.5"
        >
          <Trash2 className="size-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">{t('adminDelete.deleteKind', { kind })}</span>
          <span className="sm:hidden">{tCommon('actions.delete')}</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={tCommon('actions.cancel')}
            onClick={() => !pending && setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-bg-surface p-6 shadow-xl">
            <button
              type="button"
              onClick={() => !pending && setOpen(false)}
              className="absolute right-4 top-4 text-fg-tertiary transition-colors hover:text-fg-primary"
              aria-label={tCommon('actions.close')}
            >
              <X className="size-4" />
            </button>

            <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/[0.12] text-red-300">
              <AlertTriangle className="size-5" strokeWidth={2} />
            </div>

            <h2 className="mb-2 font-display text-2xl leading-tight">
              {t('adminDelete.confirmTitle', { kind })}
            </h2>
            <p className="text-sm leading-relaxed text-fg-secondary">
              {t.rich('adminDelete.confirmBody', {
                name,
                b: (chunks) => (
                  <span className="font-medium text-fg-primary">{chunks}</span>
                ),
              })}{' '}
              {kind === 'project'
                ? t('adminDelete.projectConsequence')
                : t('adminDelete.blueprintConsequence')}
            </p>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04] disabled:opacity-60"
              >
                {tCommon('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-3.5" strokeWidth={2.5} />
                {pending
                  ? t('adminDelete.deleting')
                  : t('adminDelete.deleteKind', { kind })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
