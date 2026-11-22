'use client'

import dynamic from 'next/dynamic'
import type { MapCanvasProps } from '@/components/map/map-canvas'

/**
 * The parent must be positioned (`relative`) and sized; pass
 * `className="absolute inset-0"` so the map fills it.
 *
 * MapLibre needs the browser (WebGL, `document`) and is large, so it is
 * loaded on its own, in the browser only, and only on pages that show a
 * map. `ssr: false` is allowed here because this is a client component.
 */
const LazyMapCanvas = dynamic(
  () => import('@/components/map/map-canvas').then((mod) => mod.MapCanvas),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 animate-pulse bg-bg-surface" aria-hidden />,
  },
)

export function MapView(props: MapCanvasProps) {
  return <LazyMapCanvas {...props} />
}
