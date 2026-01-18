export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"

export type Airline = {
  code: string
  name: string
}

export type Segment = {
  from: string
  to: string
  departAt: string | null
  arriveAt: string | null
  airline: string | null
  flightNumber: string | null
  durationMinutes?: number
  aircraft?: string | null
}

export type Offer = {
  id: string
  price: {
    total: number
    currency: string
  }
  stops: number
  durationMinutes: number
  airlines: Airline[] | string[]
  segments: Segment[]
  departAt?: string | null
  arriveAt?: string | null
}

export type PricePoint = {
  date: string
  price: number
}

export type FlightMeta = {
  minPrice: number | null
  maxPrice: number | null
  airlines: Airline[] | string[]
  stopsCounts?: Record<string, number>
  priceHistory?: PricePoint[]
  priceHistorySource?: "offers" | "google_price_graph" | "search_everywhere" | "none"
  priceHistoryFilterAware?: boolean
  priceHistoryPoints?: number
  cached?: boolean
  cacheAgeSeconds?: number | null
  cacheTtlSeconds?: number | null
}

export type FlightSearchResponse = {
  query: {
    origin: string
    destination: string
    departDate: string
    returnDate?: string | null
    adults: number
    cabin: CabinClass
  }
  offers: Offer[]
  meta: FlightMeta
}

export type FlightSearchParams = {
  origin: string
  destination: string
  departDate: string
  returnDate?: string | null
  adults: number
  cabin: CabinClass
  currency?: string | null
  limit?: number
  sort?: "cheapest" | "shortest" | "least_stops"
  maxStops?: number | null
  allowedAirlines?: string[]
}
