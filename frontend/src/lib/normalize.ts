import type { Airline, FlightMeta, Offer, Segment } from "./types"

const toAirline = (value: Airline | string): Airline => {
  if (typeof value === "string") {
    return { code: value, name: value }
  }
  return { code: value.code, name: value.name || value.code }
}

export const normalizeAirlines = (airlines: Airline[] | string[] | undefined) => {
  if (!airlines) return []
  return airlines.map((item) => toAirline(item))
}

const normalizeSegment = (segment: Segment) => {
  const departAt =
    segment.departAt || (segment as unknown as { departureTime?: string }).departureTime
  const arriveAt =
    segment.arriveAt || (segment as unknown as { arrivalTime?: string }).arrivalTime
  return {
    ...segment,
    departAt: departAt || null,
    arriveAt: arriveAt || null,
    airline: segment.airline || null,
    flightNumber: segment.flightNumber || null,
  }
}

export const normalizeOffer = (offer: Offer) => {
  const normalizedSegments = (offer.segments || []).map(normalizeSegment)
  const departAt = offer.departAt || normalizedSegments[0]?.departAt || null
  const arriveAt = offer.arriveAt || normalizedSegments.at(-1)?.arriveAt || null
  return {
    ...offer,
    airlines: normalizeAirlines(offer.airlines),
    segments: normalizedSegments,
    departAt,
    arriveAt,
  }
}

export const normalizeMeta = (meta: FlightMeta) => {
  const priceHistory = meta.priceHistory || []
  return {
    ...meta,
    airlines: normalizeAirlines(meta.airlines),
    priceHistory,
    priceHistorySource: meta.priceHistorySource || "none",
    priceHistoryFilterAware: meta.priceHistoryFilterAware ?? false,
    priceHistoryPoints: meta.priceHistoryPoints ?? priceHistory.length,
    cached: meta.cached ?? false,
    cacheAgeSeconds: meta.cacheAgeSeconds ?? null,
    cacheTtlSeconds: meta.cacheTtlSeconds ?? null,
  }
}
