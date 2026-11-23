import { describe, it, expect } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { MIDNIGHT_MAP_SCHEME, recolourStyle } from '@/lib/map-style'

const BASE: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://example.test/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#45516E' } },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': '#38435C', 'fill-antialias': false },
    },
    {
      id: 'landcover_wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: { 'fill-color': '#414E66' },
    },
    {
      id: 'something_else',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'other',
      paint: { 'line-color': '#123456' },
    },
  ],
}

function paintOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const layer = style.layers.find((l) => l.id === id)
  return (layer && 'paint' in layer ? layer.paint : {}) as Record<string, unknown>
}

function ids(style: StyleSpecification): string[] {
  return style.layers.map((l) => l.id)
}

describe('recolourStyle', () => {
  it('paints known layers in the scheme colours and keeps other paint values', () => {
    const style = recolourStyle(BASE, MIDNIGHT_MAP_SCHEME)
    expect(paintOf(style, 'background')['background-color']).toBe(MIDNIGHT_MAP_SCHEME.land)
    expect(paintOf(style, 'water')).toEqual({
      'fill-color': MIDNIGHT_MAP_SCHEME.water,
      'fill-antialias': false,
    })
  })

  it('leaves unknown layers and the input style untouched', () => {
    const style = recolourStyle(BASE, MIDNIGHT_MAP_SCHEME)
    expect(paintOf(style, 'something_else')['line-color']).toBe('#123456')
    expect(ids(style)).toEqual(ids(BASE))
    expect(paintOf(BASE, 'background')['background-color']).toBe('#45516E')
  })
})
