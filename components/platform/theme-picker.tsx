'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ================================================================
   Theme picker — Appearance settings.

   A device preference (not part of the profile "Save" flow): clicking
   a card live-applies the theme by toggling a class on <html> and
   persists the choice to localStorage under `superhero-theme`. The
   flash-free init script in the root layout reads the same key before
   first paint so there's no flash on reload.
   ================================================================ */

const THEME_KEY = 'superhero-theme'
const LIGHT_THEMES = ['daylight', 'paper', 'contrast'] as const

type ThemeKey = 'dark' | (typeof LIGHT_THEMES)[number]

interface SwatchSpec {
  bg: string
  border?: string
  dot: string
  barStrong: string
  barMid: string
  /** bottom "surface chip" bar */
  chipBg: string
  chipBorder?: string
}

interface ThemeOption {
  key: ThemeKey
  name: string
  badge?: string
  desc: string
  swatch: SwatchSpec
}

const THEMES: ThemeOption[] = [
  {
    key: 'dark',
    name: 'Midnight',
    badge: 'Default',
    desc: 'The original deep blue & amber.',
    swatch: {
      bg: '#0E1A2B',
      dot: '#F4A535',
      barStrong: 'rgba(235,241,247,0.85)',
      barMid: 'rgba(235,241,247,0.40)',
      chipBg: 'rgba(235,241,247,0.22)',
    },
  },
  {
    key: 'daylight',
    name: 'Daylight',
    desc: 'Cool, crisp white & blue-grey.',
    swatch: {
      bg: '#F4F7FB',
      dot: '#BE7400',
      barStrong: 'rgba(20,35,59,0.82)',
      barMid: 'rgba(20,35,59,0.30)',
      chipBg: '#FFFFFF',
      chipBorder: '1px solid rgba(18,40,72,0.12)',
    },
  },
  {
    key: 'paper',
    name: 'Paper',
    desc: 'Warm ivory, amber up front.',
    swatch: {
      bg: '#F6F1E8',
      dot: '#C2740A',
      barStrong: 'rgba(44,35,23,0.82)',
      barMid: 'rgba(44,35,23,0.30)',
      chipBg: '#FFFDF8',
      chipBorder: '1px solid rgba(74,52,16,0.14)',
    },
  },
  {
    key: 'contrast',
    name: 'High Contrast',
    badge: 'A11Y',
    desc: 'Maximum legibility — WCAG AAA text & strong focus.',
    swatch: {
      bg: '#FFFFFF',
      border: '1.5px solid #000',
      dot: '#6B3F00',
      barStrong: '#000',
      barMid: '#000',
      chipBg: '#FFFFFF',
      chipBorder: '1.5px solid #000',
    },
  },
]

function applyTheme(name: ThemeKey) {
  const root = document.documentElement
  LIGHT_THEMES.forEach((t) => root.classList.remove('theme-' + t))
  if (name !== 'dark') root.classList.add('theme-' + name)
}

export function ThemePicker() {
  // Start at the SSR-safe default; reconcile with the stored choice on mount.
  const [selected, setSelected] = useState<ThemeKey>('dark')

  useEffect(() => {
    let stored: ThemeKey = 'dark'
    try {
      const raw = localStorage.getItem(THEME_KEY)
      if (raw === 'daylight' || raw === 'paper' || raw === 'contrast') stored = raw
    } catch {
      /* ignore */
    }
    setSelected(stored)
  }, [])

  const choose = (name: ThemeKey) => {
    applyTheme(name)
    try {
      localStorage.setItem(THEME_KEY, name)
    } catch {
      /* ignore */
    }
    setSelected(name)
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {THEMES.map((theme) => {
        const isSelected = selected === theme.key
        return (
          <button
            key={theme.key}
            type="button"
            onClick={() => choose(theme.key)}
            aria-pressed={isSelected}
            className={cn(
              'flex items-center gap-4 rounded-xl border bg-bg-surface p-3 text-left transition-all duration-fast',
              isSelected
                ? 'border-amber-500 shadow-[0_0_0_1px_var(--brand-accent)]'
                : 'border-border-default hover:border-border-strong',
            )}
          >
            {/* Swatch preview */}
            <span
              className="flex h-[58px] w-[78px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-border-subtle p-[9px]"
              style={{ background: theme.swatch.bg, border: theme.swatch.border }}
              aria-hidden
            >
              <span className="flex items-center gap-[5px]">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: theme.swatch.dot }}
                />
                <span
                  className="h-1.5 flex-1 rounded-[3px]"
                  style={{ background: theme.swatch.barStrong }}
                />
              </span>
              <span
                className="h-1.5 w-[65%] rounded-[3px]"
                style={{ background: theme.swatch.barMid }}
              />
              <span
                className="mt-auto h-1.5 w-[80%] rounded-[3px]"
                style={{
                  background: theme.swatch.chipBg,
                  border: theme.swatch.chipBorder,
                }}
              />
            </span>

            {/* Meta */}
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-primary">
                {theme.name}
                {theme.badge && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-tertiary">
                    {theme.badge}
                  </span>
                )}
              </span>
              <span className="text-xs leading-snug text-fg-tertiary">
                {theme.desc}
              </span>
            </span>

            {/* Check */}
            <Check
              className={cn(
                'size-[18px] shrink-0 text-amber-500 transition-opacity duration-fast',
                isSelected ? 'opacity-100' : 'opacity-0',
              )}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
}
