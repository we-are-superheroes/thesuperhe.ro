'use client'

import { useTranslations } from 'next-intl'
import type { MapLabels } from '@/components/map/map-canvas'

/** The translated control labels every map needs (client components). */
export function useMapLabels(): MapLabels {
  const t = useTranslations('map')
  return {
    zoomIn: t('page.zoomIn'),
    zoomOut: t('page.zoomOut'),
    locate: t('page.useMyLocation'),
    unavailable: t('page.mapUnavailable'),
    gestureTouch: t('page.gestureTouch'),
    gestureCtrl: t('page.gestureCtrl'),
    gestureCmd: t('page.gestureCmd'),
  }
}
