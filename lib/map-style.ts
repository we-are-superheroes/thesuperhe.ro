import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

/* ================================================================
   Map colours for the Midnight theme.

   Midnight's base map is OpenFreeMap's "fiord" style. On its own it
   is a muted grey-blue where land, water and roads are nearly the
   same tone, so `recolourStyle` repaints its layers to pull the
   tones apart. Layers are matched by fiord's layer ids; a layer this
   file does not know is left as it is. The light themes use another
   style as it comes and are not repainted.

   Amber is kept for pins and the search ring: nothing on the base
   map uses it.
   ================================================================ */

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
}

export const MIDNIGHT_MAP_SCHEME: MapScheme = {
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
    waterway: { 'line-color': c.water, 'line-opacity': 1 },
    landcover_ice_shelf: { 'fill-color': c.built },
    landuse_residential: { 'fill-color': c.built, 'fill-opacity': 1 },
    landcover_wood: { 'fill-color': c.forest },
    park: { 'fill-color': c.forest, 'fill-opacity': 0.4 },
    park_outline: { 'line-color': c.forest },
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

/**
 * fiord looks for a `subclass` the map data does not carry on built-up
 * areas, so it never draws them. Match on `class` instead.
 */
const BUILT_UP_FILTER = [
  'all',
  ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false],
  ['match', ['get', 'class'], ['residential', 'commercial', 'industrial', 'retail'], true, false],
]

/** A copy of `style` (OpenFreeMap fiord) painted in `scheme`'s colours. */
export function recolourStyle(style: StyleSpecification, scheme: MapScheme): StyleSpecification {
  const overrides = paintOverrides(scheme)
  const layers = style.layers.map((layer) => {
    const override = overrides[layer.id]
    if (!override) return layer
    return {
      ...layer,
      paint: { ...layer.paint, ...override },
      ...(layer.id === 'landuse_residential' && { filter: BUILT_UP_FILTER }),
    } as LayerSpecification
  })
  return { ...style, layers }
}
