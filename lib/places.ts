import 'server-only'
import tzLookup from 'tz-lookup'
import { Prisma } from '@prisma/client'
import type { PlaceProposalKind, UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import type { ErrorDescriptor } from '@/lib/validation'
import { parseOpeningHours, type OpeningHours } from '@/lib/opening-hours'
import {
  RESERVED_PLACE_SLUGS,
  boundingBox,
  haversineKm,
  isPlaceCategory,
  pickPlaceFields,
  slugifyPlace,
  validatePlaceInput,
  type LatLng,
  type OperatingStatus,
  type PlaceCategory,
  type PlaceData,
} from '@/lib/places-shared'

/* ================================================================
   Map places — server-side queries and the single write path.

   Two rules the rest of the code relies on:

   1. EVERY read of places goes through publicPlacesWhere(). It hides
      unpublished rows and places whose Superhero project is no longer
      public — the same kind of rule as visibleProjectsWhere() in
      lib/orgs.ts. A read that skips it can leak a members-only project.

   2. ONLY applyProposal() creates, changes or hides a place. A
      member's proposal waits as `pending`; a curator's or project
      lead's direct change is written as a proposal and applied in the
      same transaction. So place_proposals is the full change history.
   ================================================================ */

/** Where-fragment every place read must include. */
export function publicPlacesWhere(): Prisma.PlaceWhereInput {
  return {
    listingStatus: 'published',
    OR: [{ projectId: null }, { project: { visibility: 'public' } }],
  }
}

export function isCuratorRole(role: UserRole | null | undefined): boolean {
  return role === 'curator' || role === 'admin'
}

/* ================================================================
   Reading
   ================================================================ */

/** One result on the map and in the list. Small enough to send in bulk. */
export interface PlaceResult {
  id: string
  slug: string
  name: string
  summary: string
  category: PlaceCategory
  lat: number
  lng: number
  approximate: boolean
  address: string | null
  city: string | null
  country: string | null
  distanceKm: number
  website: string | null
  practicalNote: string | null
  openingHours: OpeningHours | null
  openingNote: string | null
  timezone: string | null
  operatingStatus: OperatingStatus
  statusNote: string | null
  reopensOn: string | null
  hasProducts: boolean
  /** Product names, so a search for "eggs" finds the stall that sells them. */
  productNames: string[]
  /** Set for Superhero projects; null for independent places. */
  project: { id: string; stepsNeedingHelp: number; joined: number } | null
}

const RESULT_SELECT = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  category: true,
  latitude: true,
  longitude: true,
  locationApproximate: true,
  address: true,
  city: true,
  country: true,
  website: true,
  practicalNote: true,
  openingHours: true,
  openingNote: true,
  timezone: true,
  operatingStatus: true,
  statusNote: true,
  reopensOn: true,
  products: { select: { name: true }, orderBy: { sortOrder: 'asc' } },
  project: {
    select: {
      id: true,
      _count: {
        select: {
          steps: { where: { helpWanted: true, status: { not: 'completed' } } },
          contributions: { where: { projectStepId: null, status: 'active' } },
        },
      },
    },
  },
} satisfies Prisma.PlaceSelect

type ResultRow = Prisma.PlaceGetPayload<{ select: typeof RESULT_SELECT }>

function storedHours(raw: Prisma.JsonValue | null): OpeningHours | null {
  const parsed = parseOpeningHours(raw)
  return parsed.ok ? parsed.value : null
}

function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

function toResult(row: ResultRow, centre: LatLng): PlaceResult {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    category: isPlaceCategory(row.category) ? row.category : 'other',
    lat: row.latitude,
    lng: row.longitude,
    approximate: row.locationApproximate,
    // An approximate place has no public street address.
    address: row.locationApproximate ? null : row.address,
    city: row.city,
    country: row.country,
    distanceKm: haversineKm(centre, { lat: row.latitude, lng: row.longitude }),
    website: row.website,
    practicalNote: row.practicalNote,
    openingHours: storedHours(row.openingHours),
    openingNote: row.openingNote,
    timezone: row.timezone,
    operatingStatus: row.operatingStatus,
    statusNote: row.statusNote,
    reopensOn: isoDate(row.reopensOn),
    hasProducts: row.products.length > 0,
    productNames: row.products.map((p) => p.name),
    project: row.project
      ? {
          id: row.project.id,
          stepsNeedingHelp: row.project._count.steps,
          joined: row.project._count.contributions,
        }
      : null,
  }
}

/** Upper bound on rows read for one map view — a dense city centre stays fast. */
const MAX_RESULTS = 500

/**
 * Published places within `radiusKm` of `centre`, nearest first.
 * Permanently closed places are left out (their own page still explains).
 * An indexed bounding-box query does the first pass; the exact distance
 * is checked here.
 */
export async function findPlacesNear(centre: LatLng, radiusKm: number): Promise<PlaceResult[]> {
  const box = boundingBox(centre, radiusKm)
  const rows = await db.place.findMany({
    where: {
      AND: [
        publicPlacesWhere(),
        { operatingStatus: { not: 'permanently_closed' } },
        { latitude: { gte: box.minLat, lte: box.maxLat } },
        { OR: box.lngRanges.map((r) => ({ longitude: { gte: r.min, lte: r.max } })) },
      ],
    },
    select: RESULT_SELECT,
    take: MAX_RESULTS,
  })
  return rows
    .map((row) => toResult(row, centre))
    .filter((place) => place.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

const DETAIL_SELECT = {
  ...RESULT_SELECT,
  description: true,
  language: true,
  contact: true,
  currency: true,
  closedAt: true,
  lastVerifiedAt: true,
  updatedAt: true,
  projectId: true,
  products: {
    select: { id: true, name: true, group: true, note: true, priceMinor: true, unit: true, available: true, updatedAt: true },
    orderBy: { sortOrder: 'asc' },
  },
  project: {
    select: {
      id: true,
      title: true,
      _count: RESULT_SELECT.project.select._count,
      // The open steps themselves, for the "steps that need help" list.
      steps: {
        where: { helpWanted: true, status: { not: 'completed' } },
        select: { title: true, estimatedHrs: true },
        orderBy: { order: 'asc' },
        take: 12,
      },
    },
  },
} satisfies Prisma.PlaceSelect

export type PlaceDetail = Prisma.PlaceGetPayload<{ select: typeof DETAIL_SELECT }>

/** The full place for /map/[slug]; null when missing, hidden or no longer public. */
export async function getPlaceBySlug(slug: string): Promise<PlaceDetail | null> {
  return db.place.findFirst({
    where: { AND: [publicPlacesWhere(), { slug }] },
    select: DETAIL_SELECT,
  })
}

/** Everything the details panel shows for one place — plain data, safe to send to the browser. */
export interface PlaceDetailView {
  id: string
  slug: string
  name: string
  summary: string
  description: string | null
  language: string | null
  category: PlaceCategory
  lat: number
  lng: number
  approximate: boolean
  address: string | null
  city: string | null
  website: string | null
  contact: string | null
  practicalNote: string | null
  openingHours: OpeningHours | null
  openingNote: string | null
  timezone: string | null
  operatingStatus: OperatingStatus
  statusNote: string | null
  reopensOn: string | null
  currency: string
  products: Array<{
    id: string
    name: string
    group: string | null
    note: string | null
    priceMinor: number | null
    unit: string | null
    available: boolean
  }>
  /** ISO date-times. */
  pricesUpdatedAt: string | null
  lastVerifiedAt: string | null
  project: {
    id: string
    joined: number
    helpSteps: Array<{ title: string; estimatedHrs: number | null }>
  } | null
}

/** The place for the details panel; null when missing, hidden or no longer public. */
export async function getPlaceDetailView(slug: string): Promise<PlaceDetailView | null> {
  const row = await getPlaceBySlug(slug)
  if (!row) return null
  const pricesUpdated = row.products.reduce<Date | null>(
    (latest, product) => (!latest || product.updatedAt > latest ? product.updatedAt : latest),
    null,
  )
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    language: row.language,
    category: isPlaceCategory(row.category) ? row.category : 'other',
    lat: row.latitude,
    lng: row.longitude,
    approximate: row.locationApproximate,
    // An approximate place has no public street address.
    address: row.locationApproximate ? null : row.address,
    city: row.city,
    website: row.website,
    contact: row.contact,
    practicalNote: row.practicalNote,
    openingHours: storedHours(row.openingHours),
    openingNote: row.openingNote,
    timezone: row.timezone,
    operatingStatus: row.operatingStatus,
    statusNote: row.statusNote,
    reopensOn: isoDate(row.reopensOn),
    currency: row.currency ?? 'EUR',
    products: row.products.map((product) => ({
      id: product.id,
      name: product.name,
      group: product.group,
      note: product.note,
      priceMinor: product.priceMinor,
      unit: product.unit,
      available: product.available,
    })),
    pricesUpdatedAt: pricesUpdated?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    project: row.project
      ? {
          id: row.project.id,
          joined: row.project._count.contributions,
          helpSteps: row.project.steps,
        }
      : null,
  }
}

/* ================================================================
   Place data ↔ rows
   ================================================================ */

const DATA_SELECT = {
  id: true,
  slug: true,
  projectId: true,
  updatedAt: true,
  name: true,
  summary: true,
  description: true,
  language: true,
  category: true,
  latitude: true,
  longitude: true,
  locationApproximate: true,
  address: true,
  city: true,
  country: true,
  website: true,
  contact: true,
  practicalNote: true,
  openingHours: true,
  openingNote: true,
  operatingStatus: true,
  statusNote: true,
  reopensOn: true,
  currency: true,
  products: {
    select: { name: true, group: true, note: true, priceMinor: true, unit: true, available: true },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.PlaceSelect

type DataRow = Prisma.PlaceGetPayload<{ select: typeof DATA_SELECT }>

export interface EditablePlace {
  id: string
  slug: string
  projectId: string | null
  updatedAt: Date
  data: PlaceData
}

function rowToData(row: DataRow): PlaceData {
  return {
    name: row.name,
    summary: row.summary,
    description: row.description,
    language: row.language,
    category: isPlaceCategory(row.category) ? row.category : 'other',
    latitude: row.latitude,
    longitude: row.longitude,
    locationApproximate: row.locationApproximate,
    address: row.address,
    city: row.city,
    country: row.country,
    website: row.website,
    contact: row.contact,
    practicalNote: row.practicalNote,
    openingHours: storedHours(row.openingHours),
    openingNote: row.openingNote,
    operatingStatus: row.operatingStatus,
    statusNote: row.statusNote,
    reopensOn: isoDate(row.reopensOn),
    currency: row.currency ?? 'EUR',
    products: row.products,
  }
}

type Tx = Prisma.TransactionClient

/**
 * A place as editable data, for the edit form and for diffing. Reads through
 * publicPlacesWhere() unless `includeHidden` (curators restoring a hidden place).
 */
export async function getEditablePlace(
  client: Tx | typeof db,
  where: { id: string } | { slug: string },
  opts: { includeHidden?: boolean } = {},
): Promise<EditablePlace | null> {
  const row = await client.place.findFirst({
    where: opts.includeHidden ? where : { AND: [publicPlacesWhere(), where] },
    select: DATA_SELECT,
  })
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    projectId: row.projectId,
    updatedAt: row.updatedAt,
    data: rowToData(row),
  }
}

/* ================================================================
   Who may change a place directly
   ================================================================ */

/** Is the user an active lead of this project, and is the project public? */
export async function isLeadOfPublicProject(userId: string, projectId: string): Promise<boolean> {
  const lead = await db.contribution.findFirst({
    where: {
      userId,
      projectId,
      projectStepId: null,
      role: 'lead',
      status: 'active',
      project: { visibility: 'public' },
    },
    select: { id: true },
  })
  return !!lead
}

/**
 * `direct` — the change is published at once (curators and admins for any
 * place; a project lead for their own public project's place).
 * `propose` — the change waits for a curator.
 */
export async function placeEditMode(
  user: { id: string; role: UserRole },
  projectId: string | null,
): Promise<'direct' | 'propose'> {
  if (isCuratorRole(user.role)) return 'direct'
  if (projectId && (await isLeadOfPublicProject(user.id, projectId))) return 'direct'
  return 'propose'
}

/* ================================================================
   Writing — the single path
   ================================================================ */

function timezoneFor(lat: number, lng: number): string | null {
  try {
    return tzLookup(lat, lng)
  } catch {
    return null
  }
}

async function uniqueSlug(tx: Tx, name: string, city: string | null): Promise<string> {
  const base = slugifyPlace(name, city)
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (RESERVED_PLACE_SLUGS.has(candidate)) continue
    const taken = await tx.place.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!taken) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/** Column values for a place row, from validated data. */
function dataToColumns(data: PlaceData, now: Date, previousClosedAt: Date | null) {
  return {
    name: data.name,
    summary: data.summary,
    description: data.description,
    language: data.language,
    category: data.category,
    latitude: data.latitude,
    longitude: data.longitude,
    locationApproximate: data.locationApproximate,
    address: data.address,
    city: data.city,
    country: data.country,
    timezone: timezoneFor(data.latitude, data.longitude),
    website: data.website,
    contact: data.contact,
    practicalNote: data.practicalNote,
    openingHours: data.openingHours
      ? (data.openingHours as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    openingNote: data.openingNote,
    operatingStatus: data.operatingStatus,
    statusNote: data.statusNote,
    reopensOn: data.reopensOn ? new Date(`${data.reopensOn}T00:00:00Z`) : null,
    closedAt: data.operatingStatus === 'permanently_closed' ? (previousClosedAt ?? now) : null,
    currency: data.currency,
    lastVerifiedAt: now,
  }
}

function productRows(placeId: string, data: PlaceData) {
  return data.products.map((product, index) => ({
    placeId,
    sortOrder: index,
    name: product.name,
    group: product.group,
    note: product.note,
    priceMinor: product.priceMinor,
    unit: product.unit,
    available: product.available,
  }))
}

export type ApplyResult =
  | { ok: true; placeId: string; slug: string; name: string }
  /** Someone else already decided this proposal — nothing was changed. */
  | { ok: false; reason: 'already_resolved' }
  | { ok: false; reason: 'place_missing' }
  | { ok: false; reason: 'invalid'; error: ErrorDescriptor }

/**
 * Apply a pending proposal and mark it approved, inside the caller's
 * transaction. Idempotent: the proposal is claimed with a guarded update,
 * so a second approval of the same row changes nothing.
 *
 * The payload is validated again here — it may have waited in the queue
 * across a code change, and it is the last line of defence before a place
 * goes public.
 */
export async function applyProposal(
  tx: Tx,
  proposal: { id: string; kind: PlaceProposalKind; placeId: string | null; payload: unknown },
  reviewerId: string,
  opts: { projectId?: string | null; createdById?: string | null; now?: Date } = {},
): Promise<ApplyResult> {
  const now = opts.now ?? new Date()

  const claimed = await tx.placeProposal.updateMany({
    where: { id: proposal.id, status: 'pending' },
    data: { status: 'approved', reviewerId, reviewedAt: now },
  })
  if (claimed.count === 0) return { ok: false, reason: 'already_resolved' }

  if (proposal.kind === 'new') {
    const checked = validatePlaceInput(proposal.payload)
    if (!checked.ok) return { ok: false, reason: 'invalid', error: checked.error }
    const slug = await uniqueSlug(tx, checked.data.name, checked.data.city)
    const place = await tx.place.create({
      data: {
        ...dataToColumns(checked.data, now, null),
        slug,
        projectId: opts.projectId ?? null,
        createdById: opts.createdById ?? null,
      },
      select: { id: true },
    })
    if (checked.data.products.length > 0) {
      await tx.placeProduct.createMany({ data: productRows(place.id, checked.data) })
    }
    await tx.placeProposal.update({ where: { id: proposal.id }, data: { placeId: place.id } })
    return { ok: true, placeId: place.id, slug, name: checked.data.name }
  }

  if (!proposal.placeId) return { ok: false, reason: 'place_missing' }
  // Hidden places are included so a curator's edit can't be lost on one.
  const current = await getEditablePlace(tx, { id: proposal.placeId }, { includeHidden: true })
  if (!current) return { ok: false, reason: 'place_missing' }

  if (proposal.kind === 'remove') {
    await tx.place.update({
      where: { id: current.id },
      data: { listingStatus: 'hidden' },
    })
    return { ok: true, placeId: current.id, slug: current.slug, name: current.data.name }
  }

  // edit: the stored fields laid over the place as it is now.
  const changes = pickPlaceFields(proposal.payload)
  const checked = validatePlaceInput({ ...current.data, ...changes })
  if (!checked.ok) return { ok: false, reason: 'invalid', error: checked.error }

  const existing = await tx.place.findUnique({
    where: { id: current.id },
    select: { closedAt: true },
  })
  await tx.place.update({
    where: { id: current.id },
    data: dataToColumns(checked.data, now, existing?.closedAt ?? null),
  })
  if ('products' in changes) {
    await tx.placeProduct.deleteMany({ where: { placeId: current.id } })
    if (checked.data.products.length > 0) {
      await tx.placeProduct.createMany({ data: productRows(current.id, checked.data) })
    }
  }
  return { ok: true, placeId: current.id, slug: current.slug, name: checked.data.name }
}

/** Raised inside a transaction to roll it back with a typed reason. */
export class ApplyError extends Error {
  constructor(public readonly result: Exclude<ApplyResult, { ok: true }>) {
    super(result.reason)
    this.name = 'ApplyError'
  }
}

/** How many proposals a member may have waiting at once. */
export const MAX_PENDING_PROPOSALS = 10

export async function countPendingProposals(userId: string): Promise<number> {
  return db.placeProposal.count({ where: { proposerId: userId, status: 'pending' } })
}
