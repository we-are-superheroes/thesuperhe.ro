'use client'

import { useId, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Loader2, MapPin, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeocodeHit } from '@/lib/geocode'
import {
  PLACE_CATEGORY_GROUPS,
  PLACE_OPERATORS,
  RADIUS_OPTIONS_KM,
  type PlaceCategory,
  type PlaceOperator,
} from '@/lib/places-shared'
import { CategoryIcon } from '@/components/map/place-bits'

/* ================================================================
   The pieces of the map's filter bar (the "Map filters" design):
   a round button that opens a small menu, the slim pills inside the
   menus, and the tags that show which filters are set.

   The same option lists are used twice: in the menus on wide screens
   (`size="sm"`) and in the bottom sheet on phones (`size="lg"`, larger
   pills that are easy to tap). They hold no state of their own.
   ================================================================ */

export type SourceFilter = 'all' | 'hero' | 'indie'
export const SOURCE_FILTERS = ['all', 'hero', 'indie'] as const

type PillSize = 'sm' | 'lg'

export const FIELD =
  'flex h-[42px] items-center gap-2 rounded-lg border border-border-default bg-bg-input px-3 transition-colors duration-fast focus-within:border-amber-500 focus-within:shadow-[0_0_0_3px_var(--focus-ring)]'
// The whole field lights up when its text box has focus (FIELD's
// focus-within styles), so the text box must not draw a ring of its own.
// `!` is needed: the site-wide `:focus-visible` outline in globals.css is
// outside Tailwind's layers and would otherwise win over `outline-none`.
export const FIELD_INPUT =
  'h-full min-w-0 bg-transparent text-sm text-fg-primary outline-none! placeholder:text-fg-tertiary'

export const FILTER_BUTTON =
  'inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-border-default bg-bg-surface px-3 text-sm text-fg-primary transition-colors duration-fast hover:border-border-strong'

export const QUIET_BUTTON =
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-lg px-2 text-sm font-medium text-fg-secondary transition-colors duration-fast hover:bg-hover-overlay-strong hover:text-fg-primary'

/** The number on a filter button: how many filters it has set. */
export function FilterCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1.5 text-xs font-semibold text-fg-on-accent">
      {count}
    </span>
  )
}

/* ── A button with a menu under it ────────────────────────────────── */

export function FilterMenu({
  label,
  count = 0,
  active = count > 0,
  open,
  onOpenChange,
  wide = false,
  clearLabel,
  onClear,
  children,
}: {
  label: string
  /** Shown as a number on the button. */
  count?: number
  /** Amber border: this menu has something set. */
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  wide?: boolean
  /** With both set, the menu gets a footer: this clear button and "Done". */
  clearLabel?: string
  onClear?: () => void
  children: React.ReactNode
}) {
  const t = useTranslations('map')
  const popId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeAndFocus = () => {
    onOpenChange(false)
    buttonRef.current?.focus()
  }

  return (
    <div
      data-filter-menu
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        // Only the menu closes, not the details panel behind it.
        event.stopPropagation()
        closeAndFocus()
      }}
      onBlur={(event) => {
        // Tabbing out of the menu closes it.
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          onOpenChange(false)
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => onOpenChange(!open)}
        className={cn(
          FILTER_BUTTON,
          active && 'border-brand-accent',
          open && 'border-border-strong bg-bg-surface-2',
        )}
      >
        {label}
        <FilterCount count={count} />
        <ChevronDown className="size-3.5 text-fg-tertiary" strokeWidth={2.5} aria-hidden />
      </button>
      {open && (
        <div
          id={popId}
          className={cn(
            'absolute left-0 top-[calc(100%+6px)] z-20 rounded-2xl border border-border-strong bg-bg-surface p-4 shadow-lg',
            wide ? 'w-[min(500px,80vw)]' : 'w-[270px]',
          )}
        >
          {children}
          {clearLabel && onClear && (
            <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
              <button type="button" onClick={onClear} className={cn(QUIET_BUTTON, 'h-[34px]')}>
                {clearLabel}
              </button>
              <button
                type="button"
                onClick={closeAndFocus}
                className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-border-default bg-bg-surface-2 px-4 text-sm font-medium transition-colors duration-fast hover:border-border-strong hover:bg-bg-surface-3"
              >
                {t('page.filters.done')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Slim pills: a tick box or radio button drawn as a pill ───────── */

function OptionPill({
  type,
  name,
  checked,
  onChange,
  size,
  category,
  children,
}: {
  type: 'checkbox' | 'radio'
  name: string
  checked: boolean
  onChange: () => void
  size: PillSize
  category?: PlaceCategory
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        'group relative inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border border-border-default bg-bg-surface-2 transition-colors duration-fast hover:border-border-strong',
        'has-checked:border-brand-accent has-checked:bg-brand-accent has-checked:font-medium has-checked:text-fg-on-accent',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-amber-500',
        size === 'lg' ? 'min-h-10 gap-2 px-3.5 text-sm' : 'min-h-[30px] gap-1.5 px-2.5 text-[13px]',
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      {category && (
        <CategoryIcon
          category={category}
          className={cn(
            'shrink-0 text-fg-tertiary group-has-checked:text-current',
            size === 'lg' ? 'size-4' : 'size-3.5',
          )}
        />
      )}
      <span className="truncate">{children}</span>
    </label>
  )
}

const LEGEND = 'mb-2 text-xs font-semibold uppercase tracking-widest text-fg-tertiary'

/**
 * The town or postcode field with its search button. `children` come after
 * the button, inside the field (the distance select on wide screens).
 */
export function WhereField({
  id,
  className,
  value,
  onChange,
  onSubmit,
  searching,
  children,
}: {
  id: string
  className?: string
  value: string
  onChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  searching: boolean
  children?: React.ReactNode
}) {
  const t = useTranslations('map')
  return (
    <form onSubmit={onSubmit} className={cn(FIELD, className)}>
      <MapPin className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {t('page.whereLabel')}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('page.wherePlaceholder')}
        autoComplete="off"
        enterKeyHint="search"
        className={cn(FIELD_INPUT, 'w-full flex-1')}
      />
      <button
        type="submit"
        disabled={searching}
        aria-label={searching ? t('page.whereSearching') : t('page.whereSearch')}
        title={t('page.whereSearch')}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-hover-overlay-strong hover:text-fg-primary"
      >
        {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
      </button>
      {children}
    </form>
  )
}

const CHIP =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors duration-fast hover:border-border-strong hover:text-fg-primary aria-pressed:border-brand-accent aria-pressed:bg-brand-accent aria-pressed:font-medium aria-pressed:text-fg-on-accent'

/** What the town lookup found: several matches to choose from, or a problem. */
export function WhereFeedback({
  hits,
  error,
  onChoose,
}: {
  hits: GeocodeHit[] | null
  error: string | null
  onChoose: (hit: GeocodeHit) => void
}) {
  const t = useTranslations('map')
  return (
    <div className="text-sm" role="status">
      {error && <p className="text-red-300">{error}</p>}
      {hits && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-secondary">{t('page.whereChoose')}</span>
          {hits.map((hit) => (
            <button
              key={`${hit.lat},${hit.lng}`}
              type="button"
              onClick={() => onChoose(hit)}
              className={CHIP}
            >
              <span className="font-medium text-fg-primary">{hit.name}</span>
              {hit.context && <span>{hit.context}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The search distance, for the sheet on phones (wide screens use a select). */
export function RadiusOptions({
  name,
  value,
  onChange,
}: {
  name: string
  value: number
  onChange: (value: number) => void
}) {
  const t = useTranslations('map')
  return (
    <fieldset className="min-w-0">
      <legend className={LEGEND}>{t('page.distanceLabel')}</legend>
      <div className="flex flex-wrap gap-2">
        {RADIUS_OPTIONS_KM.map((km) => (
          <OptionPill
            key={km}
            type="radio"
            name={name}
            checked={value === km}
            onChange={() => onChange(km)}
            size="lg"
          >
            {t('page.distanceOption', { km })}
          </OptionPill>
        ))}
      </div>
    </fieldset>
  )
}

/** Everything / Superhero projects / Independent places. */
export function SourceOptions({
  name,
  value,
  onChange,
  size,
}: {
  name: string
  value: SourceFilter
  onChange: (value: SourceFilter) => void
  size: PillSize
}) {
  const t = useTranslations('map')
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t('page.showLabel')}</legend>
      <div className={size === 'lg' ? 'flex flex-wrap gap-2' : 'grid gap-1.5'}>
        {SOURCE_FILTERS.map((option) => (
          <OptionPill
            key={option}
            type="radio"
            name={name}
            checked={value === option}
            onChange={() => onChange(option)}
            size={size}
          >
            {t(`page.source.${option}`)}
          </OptionPill>
        ))}
      </div>
    </fieldset>
  )
}

/** The categories, in four short lists. */
export function CategoryOptions({
  name,
  chosen,
  onToggle,
  size,
}: {
  name: string
  chosen: PlaceCategory[]
  onToggle: (category: PlaceCategory) => void
  size: PillSize
}) {
  const t = useTranslations('map')
  return (
    // In a menu: two columns, one option per row. In the sheet: wrapping rows.
    <div className={size === 'sm' ? 'columns-2 gap-6' : undefined}>
      {PLACE_CATEGORY_GROUPS.map((group) => (
        <fieldset
          key={group.key}
          className={cn('min-w-0', size === 'sm' ? 'mb-4 break-inside-avoid' : 'mb-3')}
        >
          <legend className={LEGEND}>{t(`page.filters.groups.${group.key}`)}</legend>
          <div
            className={size === 'sm' ? 'flex flex-col items-start gap-1.5' : 'flex flex-wrap gap-2'}
          >
            {group.categories.map((category) => (
              <OptionPill
                key={category}
                type="checkbox"
                name={name}
                checked={chosen.includes(category)}
                onChange={() => onToggle(category)}
                size={size}
                category={category}
              >
                {t(`categories.${category}.many`)}
              </OptionPill>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

/** Who runs the place. */
export function OperatorOptions({
  name,
  chosen,
  onToggle,
  size,
}: {
  name: string
  chosen: PlaceOperator[]
  onToggle: (operator: PlaceOperator) => void
  size: PillSize
}) {
  const t = useTranslations('map')
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t('page.operatorsLabel')}</legend>
      <div className={size === 'lg' ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-1.5'}>
        {PLACE_OPERATORS.map((operator) => (
          <OptionPill
            key={operator}
            type="checkbox"
            name={name}
            checked={chosen.includes(operator)}
            onChange={() => onToggle(operator)}
            size={size}
          >
            {t(`operators.${operator}`)}
          </OptionPill>
        ))}
      </div>
    </fieldset>
  )
}

/* ── A filter that is set, shown as a tag that removes it ─────────── */

export function FilterTag({
  label,
  category,
  onRemove,
}: {
  label: string
  category?: PlaceCategory
  onRemove: () => void
}) {
  const t = useTranslations('map')
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('page.filters.remove', { name: label })}
      className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border-default bg-bg-surface-2 px-2.5 text-sm transition-colors duration-fast hover:border-border-strong"
    >
      {category && <CategoryIcon category={category} className="size-3.5 text-fg-tertiary" />}
      {label}
      <X className="size-3.5 text-fg-tertiary" strokeWidth={2.5} aria-hidden />
    </button>
  )
}
