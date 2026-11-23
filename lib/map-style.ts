import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

/* ================================================================
   Map colour schemes — one per platform theme.

   The base map is OpenFreeMap's "fiord" style. On its own it is a
   muted grey-blue where land, water and roads are nearly the same
   tone, so `recolourStyle` repaints its layers with colours from the
   active theme. Layers are matched by fiord's layer ids; a layer this
   file does not know is left as it is.

   Amber is kept for pins and the search ring: nothing on the base
   map uses it.
   ================================================================ */

export type MapSchemeId = 'midnight' | 'daylight' | 'paper' | 'contrast'

export interface MapScheme {
  land: string
  /** Built-up areas. */
  built: string
  water: string
  /** Woodland and parks. */
  forest: string
  roadMajor: string
  roadMinor: string
  boundary: string
  /** Town and city names. */
  label: string
  /** Village, suburb and street names. */
  labelMinor: string
  /** Thin outline around names so they stay readable over roads and water. */
  halo: string
  waterLabel: string
  /** High Contrast only: dark edges, because pale fills alone are too weak on white. */
  waterLine?: string
  forestLine?: string
}

export const MAP_SCHEMES: Record<MapSchemeId, MapScheme> = {
  midnight: {
    land: '#2A3F5C',
    built: '#35506F',
    water: '#0A1422',
    forest: '#1F6048',
    roadMajor: '#A8BCCE',
    roadMinor: '#5F7696',
    boundary: '#CDDAE8',
    label: '#EBF1F7',
    labelMinor: '#CDDAE8',
    halo: '#0E1A2B',
    waterLabel: '#7AAEE8',
  },
  daylight: {
    land: '#F4F7FB',
    built: '#DCE5F1',
    water: '#6FA3E0',
    forest: '#93CFB0',
    roadMajor: '#465875',
    roadMinor: '#A6B3C6',
    boundary: '#74859E',
    label: '#14233B',
    labelMinor: '#465875',
    halo: '#FFFFFF',
    waterLabel: '#122848',
  },
  paper: {
    land: '#F6F1E8',
    built: '#E7DCC7',
    water: '#6FA3D6',
    forest: '#A3C98C',
    roadMajor: '#6A5C48',
    roadMinor: '#C3B9A4',
    boundary: '#9C8E78',
    label: '#2C2317',
    labelMinor: '#6A5C48',
    halo: '#FFFDF8',
    waterLabel: '#122848',
  },
  contrast: {
    land: '#FFFFFF',
    built: '#E4E4E4',
    water: '#7FB2EC',
    waterLine: '#1B3A6B',
    forest: '#BFE3CF',
    forestLine: '#1A5C40',
    roadMajor: '#000000',
    roadMinor: '#595959',
    boundary: '#000000',
    label: '#000000',
    labelMinor: '#1A1A1A',
    halo: '#FFFFFF',
    waterLabel: '#0E1A2B',
  },
}

type Paint = Record<string, unknown>

function nameHalo(c: MapScheme, colour: string): Paint {
  return {
    'text-color': colour,
    'text-halo-color': c.halo,
    'text-halo-width': 1.5,
    'text-halo-blur': 0,
    'text-opacity': 1,
  }
}

/** New paint values per fiord layer id. */
function paintOverrides(c: MapScheme): Record<string, Paint> {
  const rail = { 'line-color': c.roadMinor }
  const railDash = { 'line-color': c.land }
  const majorName = nameHalo(c, c.label)
  const minorName = nameHalo(c, c.labelMinor)
  return {
    background: { 'background-color': c.land },
    water: { 'fill-color': c.water },
    waterway: { 'line-color': c.waterLine ?? c.water, 'line-opacity': 1 },
    landcover_ice_shelf: { 'fill-color': c.built },
    landuse_residential: { 'fill-color': c.built, 'fill-opacity': 1 },
    landcover_wood: { 'fill-color': c.forest },
    park: { 'fill-color': c.forest, 'fill-opacity': 0.4 },
    park_outline: { 'line-color': c.forestLine ?? c.forest },
    building: { 'fill-color': c.roadMinor, 'fill-opacity': 0.3 },

    tunnel_motorway_casing: { 'line-color': c.roadMinor },
    tunnel_motorway_inner: { 'line-color': c.built },
    'aeroway-taxiway': { 'line-color': c.roadMinor },
    'aeroway-runway-casing': { 'line-color': c.roadMinor },
    'aeroway-area': { 'fill-color': c.built },
    'aeroway-runway': { 'line-color': c.built },
    road_area_pier: { 'fill-color': c.land },
    road_pier: { 'line-color': c.land },

    highway_path: { 'line-color': c.roadMinor },
    highway_minor: { 'line-color': c.roadMinor, 'line-opacity': 1 },
    highway_major_casing: { 'line-color': c.halo },
    highway_major_inner: { 'line-color': c.roadMajor },
    highway_major_subtle: { 'line-color': c.roadMajor, 'line-opacity': 0.8, 'line-width': 1.5 },
    highway_motorway_casing: { 'line-color': c.halo },
    highway_motorway_inner: { 'line-color': c.roadMajor },
    highway_motorway_subtle: { 'line-color': c.roadMajor, 'line-opacity': 0.6 },

    railway_transit: rail,
    railway_transit_dashline: railDash,
    railway_service: rail,
    railway_service_dashline: railDash,
    railway: rail,
    railway_dashline: railDash,

    boundary_state: { 'line-color': c.boundary, 'line-opacity': 0.45, 'line-blur': 0 },
    'boundary_country_z0-4': { 'line-color': c.boundary, 'line-opacity': 0.8, 'line-blur': 0 },
    'boundary_country_z5-': { 'line-color': c.boundary, 'line-opacity': 0.8, 'line-blur': 0 },

    water_name: {
      'text-color': c.waterLabel,
      'text-halo-color': c.water,
      'text-halo-width': 1,
      'text-halo-blur': 0,
    },
    highway_name_other: minorName,
    place_other: minorName,
    place_suburb: minorName,
    place_village: minorName,
    place_state: minorName,
    place_town: majorName,
    place_city: majorName,
    place_city_large: majorName,
    place_country_other: majorName,
    place_country_minor: majorName,
    place_country_major: majorName,
    place_continent: { 'text-color': c.label, 'text-halo-color': c.halo },
  }
}

const POLYGONS = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false]

/**
 * fiord looks for a `subclass` the map data does not carry on built-up
 * areas, so it never draws them. Match on `class` instead.
 */
const BUILT_UP_FILTER = [
  'all',
  POLYGONS,
  ['match', ['get', 'class'], ['residential', 'commercial', 'industrial', 'retail'], true, false],
]

function outlineLayer(
  id: string,
  sourceLayer: string,
  colour: string,
  filter: unknown,
  minzoom = 0,
): LayerSpecification {
  return {
    id,
    type: 'line',
    minzoom,
    source: 'openmaptiles',
    'source-layer': sourceLayer,
    filter,
    paint: { 'line-color': colour, 'line-width': 1.5 },
  } as LayerSpecification
}

/** A copy of `style` (OpenFreeMap fiord) painted in `scheme`'s colours. */
export function recolourStyle(style: StyleSpecification, scheme: MapScheme): StyleSpecification {
  const overrides = paintOverrides(scheme)
  const layers: LayerSpecification[] = []

  for (const layer of style.layers) {
    const override = overrides[layer.id]
    let next = override
      ? ({ ...layer, paint: { ...layer.paint, ...override } } as LayerSpecification)
      : layer
    if (layer.id === 'landuse_residential') {
      next = { ...next, filter: BUILT_UP_FILTER } as LayerSpecification
    }
    layers.push(next)

    if (layer.id === 'water' && scheme.waterLine) {
      layers.push(outlineLayer('water_outline', 'water', scheme.waterLine, POLYGONS))
    }
    if (layer.id === 'landcover_wood' && scheme.forestLine) {
      layers.push(
        outlineLayer(
          'landcover_wood_outline',
          'landcover',
          scheme.forestLine,
          ['all', POLYGONS, ['==', ['get', 'class'], 'wood']],
          // Woodland fades in between zoom 9 and 12; the edge appears with it.
          11,
        ),
      )
    }
  }

  return { ...style, layers }
}
