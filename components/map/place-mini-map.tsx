'use client'

import { MapView } from '@/components/map/map-loader'
import { useMapLabels } from '@/components/map/use-map-labels'
import type { PlaceCategory } from '@/lib/places-shared'

/** The small, single-pin map on a place page. */
export function PlaceMiniMap({
  lat,
  lng,
  hero,
  category,
  approximate,
  label,
}: {
  lat: number
  lng: number
  hero: boolean
  category: PlaceCategory
  approximate: boolean
  /** Accessible name of the pin. */
  label: string
}) {
  const labels = useMapLabels()
  return (
    <MapView
      className="absolute inset-0"
      // An approximate place is shown from further out: the pin marks an area.
      view={{ centre: { lat, lng }, zoom: approximate ? 12 : 15 }}
      pins={[{ id: 'place', lat, lng, hero, category, approximate, label }]}
      labels={{ ...labels, locate: undefined }}
      // The page scrolls, so the map must not trap the scroll.
      scrollSafe="always"
    />
  )
}
