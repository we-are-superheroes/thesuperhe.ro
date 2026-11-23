'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Loader2, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { boundingBox, type LatLng, type PlaceCategory } from '@/lib/places-shared'
import { MIDNIGHT_MAP_SCHEME, recolourStyle } from '@/lib/map-style'
import { CATEGORY_ICON_PATHS, LEAF_PATH } from '@/components/map/place-bits'

type MapLibre = maplibregl.Map
type Marker = maplibregl.Marker

/* ================================================================
   MapCanvas — the one place MapLibre is used.

   Three jobs, picked by props:
     - explorer: pins for the current results, a search-radius ring,
       the visitor's own position (/map)
     - mini map: one pin, fixed view (/map/[slug])
     - picker: one draggable pin; clicking the map moves it (the
       add / suggest form)

   MapLibre draws outside React, so pins are plain DOM buttons built
   here and kept in step with props by effects. This file is only
   ever loaded in the browser (see map-loader.tsx, which imports it
   with `ssr: false`), which is why it may touch `document` freely.

   maplibre-gl is kept on version 5 on purpose: version 6 loads its
   worker from a separate module file, which Next's bundler (Turbopack)
   does not serve — the map stays blank with "Worker failed to load".
   Version 5 ships the worker inside its single file.

   Tiles: OpenFreeMap by default (OpenStreetMap data, no key). The
   style URLs come from NEXT_PUBLIC_MAP_STYLE_LIGHT / _DARK so the
   tile host can be changed without a code change. The light themes
   show their style as it comes; Midnight's is repainted in clearer
   colours by lib/map-style.ts, which expects the layer names of
   OpenFreeMap's "fiord".
   ================================================================ */

const STYLE_LIGHT =
  process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ?? 'https://tiles.openfreemap.org/styles/positron'
const STYLE_DARK =
  process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? 'https://tiles.openfreemap.org/styles/fiord'

/** The three light themes add a class to <html>; Midnight (the default) adds none. */
const LIGHT_THEME_CLASSES = ['theme-daylight', 'theme-paper', 'theme-contrast']

function isLightTheme(): boolean {
  const classes = document.documentElement.classList
  return LIGHT_THEME_CLASSES.some((c) => classes.contains(c))
}

/**
 * Load the base style for a light theme or for Midnight. A full reload (no
 * diffing) so `style.load` fires every time and the search ring is re-added.
 */
function applyStyle(map: maplibregl.Map, light: boolean) {
  if (light) {
    map.setStyle(STYLE_LIGHT, { diff: false })
    return
  }
  map.setStyle(STYLE_DARK, {
    diff: false,
    transformStyle: (_previous, next): StyleSpecification =>
      recolourStyle(next, MIDNIGHT_MAP_SCHEME),
  })
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export interface MapPin {
  id: string
  lat: number
  lng: number
  /** Superhero project (amber diamond) or independent place (round). */
  hero: boolean
  category: PlaceCategory
  /** Accessible name of the pin button. */
  label: string
  approximate?: boolean
}

export interface MapView {
  centre: LatLng
  /** Fit the map to this search radius and draw its ring. */
  radiusKm?: number
  /** Used when there is no radius (mini map, picker). */
  zoom?: number
}

export interface MapLabels {
  zoomIn: string
  zoomOut: string
  locate?: string
  unavailable: string
  /** Hints MapLibre shows when `scrollSafe` blocks a one-finger or plain-wheel gesture. */
  gestureTouch: string
  gestureCtrl: string
  gestureCmd: string
}

export interface MapCanvasProps {
  view: MapView | null
  /** Where to look when there is no view yet (nothing searched). */
  fallback?: { centre: LatLng; zoom: number }
  pins?: MapPin[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** The visitor's own (rounded) position. */
  you?: LatLng | null
  /** Picker mode: the pin's position and what to do when it moves. */
  picker?: { value: LatLng | null; onChange: (position: LatLng) => void }
  onLocate?: () => void
  locating?: boolean
  labels: MapLabels
  /**
   * Stop the map from swallowing page scrolling: the page scrolls with one
   * finger (or the wheel) and the map moves with two fingers (or Ctrl + wheel).
   * `always` for a map inside a scrolling page; `narrow` when that is only
   * the case on small screens (the explorer stacks map over list below `lg`).
   */
  scrollSafe?: 'always' | 'narrow'
  className?: string
  /** Overlays drawn above the map (legend, detail card). */
  children?: React.ReactNode
}

/* ── DOM helpers for pins ─────────────────────────────────────────── */

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgElement(viewBox: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  return svg
}

function categorySvg(category: PlaceCategory): SVGSVGElement {
  const svg = svgElement('0 0 24 24', 'size-4')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', CATEGORY_ICON_PATHS[category])
  svg.appendChild(path)
  return svg
}

function leafSvg(): SVGSVGElement {
  const svg = svgElement('0 0 100 100', 'size-[18px] -rotate-45')
  for (const [fill, angle] of [
    ['#1A5C40', -24],
    ['#2E1A00', 24],
  ] as const) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', LEAF_PATH)
    path.setAttribute('fill', fill)
    path.setAttribute('transform', `rotate(${angle} 50 88)`)
    svg.appendChild(path)
  }
  return svg
}

// Fixed pin colours (not theme tokens): a pin must stand out on any map style.
const PIN_SHAPE_BASE =
  'flex size-[30px] items-center justify-center shadow-[0_3px_10px_rgba(0,0,0,0.45)] transition-transform duration-fast group-hover:scale-110 group-data-[selected=true]:scale-125 group-data-[selected=true]:outline group-data-[selected=true]:outline-[3px] group-data-[selected=true]:outline-offset-[3px]'
const PIN_SHAPE_INDIE =
  'rounded-full border-2 border-[#152236] bg-[#F5F8FB] text-[#152236] group-data-[selected=true]:outline-amber-500'
const PIN_SHAPE_HERO =
  'rotate-45 rounded-lg border-2 border-amber-900 bg-amber-500 group-data-[selected=true]:outline-white'

function buildPinElement(pin: MapPin, onClick: (id: string) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'group flex size-9 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-500 data-[selected=true]:z-10'
  button.setAttribute('aria-label', pin.label)
  button.setAttribute('aria-pressed', 'false')
  button.dataset.selected = 'false'
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick(pin.id)
  })
  const shape = document.createElement('span')
  shape.className = cn(
    PIN_SHAPE_BASE,
    pin.hero ? PIN_SHAPE_HERO : PIN_SHAPE_INDIE,
    pin.approximate && 'border-dashed',
  )
  shape.appendChild(pin.hero ? leafSvg() : categorySvg(pin.category))
  button.appendChild(shape)
  return button
}

function buildYouElement(): HTMLElement {
  const dot = document.createElement('div')
  dot.className =
    'pointer-events-none size-4 rounded-full border-[3px] border-white bg-blue-400 shadow-[0_0_0_6px_rgba(74,127,212,0.3)]'
  return dot
}

/* ── Search-radius ring ───────────────────────────────────────────── */

const RING_SOURCE = 'search-ring'

/** A circle of `radiusKm` around `centre` as a GeoJSON polygon. */
function circlePolygon(centre: LatLng, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points: [number, number][] = []
  const angular = radiusKm / 6371.0088
  const lat1 = (centre.lat * Math.PI) / 180
  const lng1 = (centre.lng * Math.PI) / 180
  for (let i = 0; i <= 72; i++) {
    const bearing = (i / 72) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    )
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      )
    points.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [points] } }
}

const EMPTY_RING: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function accentColour(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() ||
    '#F4A535'
  )
}

/** Add the ring source + layers if this style doesn't have them yet, then set its shape. */
function syncRing(map: MapLibre, view: MapView | null) {
  const data = view?.radiusKm ? circlePolygon(view.centre, view.radiusKm) : EMPTY_RING
  const source = map.getSource(RING_SOURCE) as GeoJSONSource | undefined
  if (source) {
    void source.setData(data)
    return
  }
  const colour = accentColour()
  map.addSource(RING_SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: `${RING_SOURCE}-fill`,
    type: 'fill',
    source: RING_SOURCE,
    paint: { 'fill-color': colour, 'fill-opacity': 0.05 },
  })
  map.addLayer({
    id: `${RING_SOURCE}-line`,
    type: 'line',
    source: RING_SOURCE,
    paint: { 'line-color': colour, 'line-width': 1.5, 'line-dasharray': [4, 4] },
  })
}

function boundsFor(view: MapView): LngLatBoundsLike | null {
  if (!view.radiusKm) return null
  const box = boundingBox(view.centre, view.radiusKm)
  // Across the antimeridian or at a pole a simple box is wrong: just centre.
  if (box.lngRanges.length !== 1) return null
  return [
    [box.lngRanges[0].min, box.minLat],
    [box.lngRanges[0].max, box.maxLat],
  ]
}

function applyView(map: MapLibre, view: MapView, animate: boolean) {
  const bounds = boundsFor(view)
  if (bounds) {
    map.fitBounds(bounds, { padding: 28, maxZoom: 15, duration: animate ? 400 : 0 })
  } else {
    const zoom = view.zoom ?? 13
    if (animate) map.easeTo({ center: [view.centre.lng, view.centre.lat], zoom, duration: 400 })
    else map.jumpTo({ center: [view.centre.lng, view.centre.lat], zoom })
  }
}

const CONTROL_BUTTON =
  'flex size-10 items-center justify-center text-fg-primary transition-colors hover:bg-bg-surface-3 disabled:opacity-60'
const CONTROL_GROUP =
  'flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface-2 shadow-md'

export function MapCanvas({
  view,
  fallback,
  pins,
  selectedId = null,
  onSelect,
  you = null,
  picker,
  onLocate,
  locating = false,
  labels,
  scrollSafe,
  className,
  children,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const pinMarkers = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>())
  const youMarker = useRef<Marker | null>(null)
  const pickerMarker = useRef<Marker | null>(null)
  const firstView = useRef(true)

  // Checked once, before the first render, so a device without WebGL gets
  // the fallback text instead of a blank box.
  const [unavailable] = useState(() => !supportsWebGL())

  // The latest callbacks and view, readable from map event handlers that
  // were registered once.
  const onSelectRef = useRef(onSelect)
  const pickerRef = useRef(picker)
  const viewRef = useRef(view)
  useEffect(() => {
    onSelectRef.current = onSelect
    pickerRef.current = picker
    viewRef.current = view
  })

  /* ── Create the map once ─────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current
    if (!container || unavailable) return

    const start = viewRef.current
    const map = new maplibregl.Map({
      container,
      center: start
        ? [start.centre.lng, start.centre.lat]
        : fallback
          ? [fallback.centre.lng, fallback.centre.lat]
          : [8.2, 46.8],
      zoom: start?.zoom ?? fallback?.zoom ?? 6,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      cooperativeGestures:
        scrollSafe === 'always' ||
        (scrollSafe === 'narrow' && window.matchMedia('(max-width: 1023px)').matches),
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': labels.gestureTouch,
        'CooperativeGesturesHandler.WindowsHelpText': labels.gestureCtrl,
        'CooperativeGesturesHandler.MacHelpText': labels.gestureCmd,
      },
    })
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    mapRef.current = map
    let light = isLightTheme()

    // The ring lives in the style, so it is re-added whenever a style loads
    // (first load and every theme switch).
    map.on('style.load', () => syncRing(map, viewRef.current))

    // On a small map the attribution starts folded behind its (i) button
    // (one click opens it) instead of covering a third of the map.
    map.once('load', () => {
      if (container.clientWidth < 420) {
        container
          .querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show')
      }
    })

    map.on('click', (event) => {
      pickerRef.current?.onChange({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    })

    // Follow the theme picker: it swaps a class on <html>.
    applyStyle(map, light)
    const observer = new MutationObserver(() => {
      const next = isLightTheme()
      if (next !== light) {
        light = next
        applyStyle(map, next)
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const markers = pinMarkers.current
    return () => {
      observer.disconnect()
      markers.clear()
      youMarker.current = null
      pickerMarker.current = null
      mapRef.current = null
      firstView.current = true
      map.remove()
    }
    // The map is created once; later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable])

  /* ── View: centre, radius ring ───────────────────────────────────── */
  const viewKey = view
    ? `${view.centre.lat},${view.centre.lng},${view.radiusKm ?? ''},${view.zoom ?? ''}`
    : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = viewRef.current
    if (current) {
      applyView(map, current, !firstView.current)
      firstView.current = false
    }
    if (map.isStyleLoaded()) syncRing(map, current)
  }, [viewKey])

  /* ── Result pins ─────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = pinMarkers.current
    const wanted = new Map((pins ?? []).map((pin) => [pin.id, pin]))

    for (const [id, entry] of markers) {
      if (!wanted.has(id)) {
        entry.marker.remove()
        markers.delete(id)
      }
    }
    for (const pin of wanted.values()) {
      const existing = markers.get(pin.id)
      if (existing) {
        existing.marker.setLngLat([pin.lng, pin.lat])
        existing.element.setAttribute('aria-label', pin.label)
        continue
      }
      const element = buildPinElement(pin, (id) => onSelectRef.current?.(id))
      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      markers.set(pin.id, { marker, element })
    }
  }, [pins])

  /* ── Selection ───────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    for (const [id, entry] of pinMarkers.current) {
      const selected = id === selectedId
      entry.element.setAttribute('data-selected', String(selected))
      entry.element.setAttribute('aria-pressed', String(selected))
    }
    if (!map || !selectedId) return
    const entry = pinMarkers.current.get(selectedId)
    if (!entry) return
    // Bring a selected place into view if the visitor has panned away from it.
    const position = entry.marker.getLngLat()
    if (!map.getBounds().contains(position)) map.easeTo({ center: position, duration: 400 })
  }, [selectedId, pins])

  /* ── The visitor's own position ──────────────────────────────────── */
  const youKey = you ? `${you.lat},${you.lng}` : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    youMarker.current?.remove()
    youMarker.current = null
    if (!youKey) return
    const [lat, lng] = youKey.split(',').map(Number)
    youMarker.current = new maplibregl.Marker({ element: buildYouElement(), anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)
  }, [youKey])

  /* ── Picker pin ──────────────────────────────────────────────────── */
  const isPicker = !!picker
  const pickerKey = picker?.value ? `${picker.value.lat},${picker.value.lng}` : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isPicker) return
    if (!pickerKey) {
      pickerMarker.current?.remove()
      pickerMarker.current = null
      return
    }
    const [lat, lng] = pickerKey.split(',').map(Number)
    if (!pickerMarker.current) {
      const marker = new maplibregl.Marker({ draggable: true, color: '#F4A535' }).setLngLat([lng, lat]).addTo(map)
      marker.on('dragend', () => {
        const position = marker.getLngLat()
        pickerRef.current?.onChange({ lat: position.lat, lng: position.lng })
      })
      pickerMarker.current = marker
    } else {
      pickerMarker.current.setLngLat([lng, lat])
    }
  }, [isPicker, pickerKey])

  if (unavailable) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-bg-surface p-6 text-center text-sm text-fg-secondary',
          className,
        )}
      >
        <p className="max-w-xs">{labels.unavailable}</p>
        {children}
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden bg-bg-surface', className)}>
      {/* Sized with width/height, not `absolute inset-0`: MapLibre's stylesheet
          sets `position: relative` on its container and would cancel that. */}
      <div ref={containerRef} className="size-full" />

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <div className={CONTROL_GROUP}>
          <button
            type="button"
            className={CONTROL_BUTTON}
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            onClick={() => mapRef.current?.zoomIn()}
          >
            <Plus className="size-[18px]" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className={cn(CONTROL_BUTTON, 'border-t border-border-default')}
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            onClick={() => mapRef.current?.zoomOut()}
          >
            <Minus className="size-[18px]" strokeWidth={2.5} />
          </button>
        </div>
        {onLocate && labels.locate && (
          <div className={CONTROL_GROUP}>
            <button
              type="button"
              className={CONTROL_BUTTON}
              aria-label={labels.locate}
              title={labels.locate}
              onClick={onLocate}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="size-[18px] animate-spin" />
              ) : (
                <LocateFixed className="size-[18px]" />
              )}
            </button>
          </div>
        )}
      </div>

      {children}
    </div>
  )
}
