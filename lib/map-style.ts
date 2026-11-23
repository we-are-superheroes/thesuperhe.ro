import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

/* ================================================================
   Map colours for the Midnight theme.

   Every theme draws OpenFreeMap's "positron" style. The light themes
   show it as it comes; for Midnight `toMidnightStyle` repaints its
   layers in the theme's navy tones, keeping positron's quiet look:
   roads a little lighter than the land, water darker, soft greens.
   Layers are matched by positron's layer ids; a layer this file does
   not know is left as it is.

   Amber is kept for pins and the search ring: nothing on the base
   map uses it.
   ================================================================ */

const C = {
  land: '#22334C',
  /** Built-up areas. */
  built: '#27394F',
  building: '#2D4059',
  buildingEdge: '#394F6C',
  water: '#0E1826',
  park: '#22403F',
  wood: '#234541',
  ice: '#3B5374',
  /** Main roads and motorways. */
  roadMajor: '#566D8E',
  roadMinor: '#3B506E',
  path: '#33465F',
  /** Thin dark edge around main roads. */
  roadEdge: '#172436',
  rail: '#3F5473',
  boundary: '#7388A6',
  /** Town, city and country names. */
  label: '#EBF1F7',
  /** Smaller place names. */
  labelMinor: '#CDDAE8',
  roadLabel: '#9DB0C7',
  waterLabel: '#7AAEE8',
  /** Outline around names so they stay readable over roads and water. */
  halo: 'rgba(14, 26, 43, 0.85)',
} as const

type Paint = Record<string, unknown>

function name(colour: string): Paint {
  return { 'text-color': colour, 'text-halo-color': C.halo, 'text-halo-width': 1.5 }
}

const rail: Paint = { 'line-color': C.rail }
const railDash: Paint = { 'line-color': C.land }
const motorwayEdge: Paint = { 'line-color': C.roadEdge }
const motorway: Paint = { 'line-color': C.roadMajor }

/** New paint values per positron layer id. */
const MIDNIGHT_PAINT: Record<string, Paint> = {
  background: { 'background-color': C.land },
  park: { 'fill-color': C.park },
  water: { 'fill-color': C.water },
  landcover_ice_shelf: { 'fill-color': C.ice },
  landcover_glacier: { 'fill-color': C.ice },
  landuse_residential: { 'fill-color': C.built },
  landcover_wood: { 'fill-color': C.wood },
  waterway: { 'line-color': C.water },
  building: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge },

  tunnel_motorway_casing: { 'line-color': C.roadEdge },
  tunnel_motorway_inner: { 'line-color': C.roadMinor },
  'aeroway-taxiway': { 'line-color': C.roadMinor },
  'aeroway-runway-casing': { 'line-color': C.roadMinor },
  'aeroway-area': { 'fill-color': C.built },
  'aeroway-runway': { 'line-color': C.roadMajor },
  road_area_pier: { 'fill-color': C.land },
  road_pier: { 'line-color': C.land },

  highway_path: { 'line-color': C.path },
  highway_minor: { 'line-color': C.roadMinor },
  highway_major_casing: { 'line-color': C.roadEdge },
  highway_major_inner: { 'line-color': C.roadMajor },
  highway_major_subtle: { 'line-color': C.roadMajor },
  highway_motorway_casing: motorwayEdge,
  highway_motorway_inner: motorway,
  highway_motorway_subtle: motorway,
  highway_motorway_bridge_casing: motorwayEdge,
  highway_motorway_bridge_inner: motorway,

  railway_transit: rail,
  railway_transit_dashline: railDash,
  railway_service: rail,
  railway_service_dashline: railDash,
  railway: rail,
  railway_dashline: railDash,

  boundary_3: { 'line-color': C.boundary },
  boundary_2: { 'line-color': C.boundary },
  boundary_disputed: { 'line-color': C.boundary },

  waterway_line_label: name(C.waterLabel),
  water_name_point_label: name(C.waterLabel),
  water_name_line_label: name(C.waterLabel),
  'highway-name-path': name(C.roadLabel),
  'highway-name-minor': name(C.roadLabel),
  'highway-name-major': name(C.roadLabel),
  airport: name(C.labelMinor),
  label_other: name(C.labelMinor),
  label_state: name(C.labelMinor),
  label_village: name(C.label),
  label_town: name(C.label),
  label_city: name(C.label),
  label_city_capital: name(C.label),
  label_country_3: name(C.label),
  label_country_2: name(C.label),
  label_country_1: name(C.label),
}

/** A copy of `style` (OpenFreeMap positron) painted in Midnight's colours. */
export function toMidnightStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    const override = MIDNIGHT_PAINT[layer.id]
    if (!override) return layer
    return { ...layer, paint: { ...layer.paint, ...override } } as LayerSpecification
  })
  return { ...style, layers }
}
