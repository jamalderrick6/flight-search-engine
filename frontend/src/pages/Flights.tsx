import { useEffect, useMemo, useState } from "react"
import FilterAltIcon from "@mui/icons-material/FilterAlt"
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff"
import FlightLandIcon from "@mui/icons-material/FlightLand"
import SearchForm from "../components/SearchForm"
import FiltersPanel from "../components/FiltersPanel"
import PriceChart from "../components/PriceChart"
import ResultsList from "../components/ResultsList"
import MobileFiltersDrawer from "../components/MobileFiltersDrawer"
import { fetchFlights } from "../lib/api"
import { normalizeMeta, normalizeOffer } from "../lib/normalize"
import useDebouncedValue from "../lib/useDebouncedValue"
import type {
  Airline,
  FlightSearchParams,
  FlightSearchResponse,
} from "../lib/types"

const todayIso = new Date().toISOString().slice(0, 10)

type SearchState = {
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  adults: number
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"
  currency: string
}

const initialSearch: SearchState = {
  origin: "",
  destination: "",
  departDate: todayIso,
  returnDate: null,
  adults: 1,
  cabin: "ECONOMY",
  currency: "USD",
}

type FiltersState = {
  sort: "cheapest" | "shortest" | "least_stops"
  maxStops: number | null
  limit: number
  allowedAirlines: string[]
}

const initialFilters: FiltersState = {
  sort: "cheapest",
  maxStops: null,
  limit: 50,
  allowedAirlines: [],
}

export default function Flights() {
  const [searchDraft, setSearchDraft] = useState({
    ...initialSearch,
  })
  const [searchParams, setSearchParams] = useState({
    ...initialSearch,
  })
  const [filters, setFilters] = useState({
    ...initialFilters,
  })
  const [results, setResults] = useState<FlightSearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const combinedParams: FlightSearchParams = useMemo(
    () => ({
      ...searchParams,
      ...filters,
    }),
    [searchParams, filters]
  )

  const debouncedParams = useDebouncedValue(combinedParams, 300)

  const sortedPriceHistory = useMemo(() => {
    const points = results?.meta.priceHistory || []
    return [...points].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  }, [results])

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    const originReady = debouncedParams.origin?.trim()
    const destinationReady = debouncedParams.destination?.trim()
    if (!originReady || !destinationReady) {
      setIsLoading(false)
      setError(null)
      setResults(null)
      return () => {
        isMounted = false
        controller.abort()
      }
    }

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const payload = await fetchFlights(debouncedParams, controller.signal)
        if (!isMounted) return
        const normalizedOffers = payload.offers.map(normalizeOffer)
        const normalizedMeta = normalizeMeta(payload.meta)
        setResults({
          ...payload,
          offers: normalizedOffers,
          meta: normalizedMeta,
        })
      } catch (err) {
        if (!isMounted || controller.signal.aborted) return
        const message =
          err instanceof Error ? err.message : "Something went wrong."
        setError(message)
        setResults(null)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    run()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [debouncedParams])

  const airlines: Airline[] = useMemo(() => {
    const meta = results?.meta
    if (!meta?.airlines) return []
    return meta.airlines as Airline[]
  }, [results])

  return (
    <div className="min-h-screen px-4 py-8 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-orange-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">
                Flight Search Engine
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">
                Find flexible routes, fast.
              </h1>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 sm:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <FilterAltIcon fontSize="inherit" className="mr-2" />
              Filters
            </button>
          </div>

          <SearchForm
            values={searchDraft}
            onChange={setSearchDraft}
            onSubmit={() => setSearchParams({ ...searchDraft })}
            isLoading={isLoading}
          />
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden h-fit rounded-3xl border border-white/70 bg-white/70 p-6 shadow-lg shadow-orange-100 lg:block">
            <FiltersPanel
              filters={filters}
              onChange={setFilters}
              airlines={airlines}
            />
          </aside>

          <main className="space-y-6">
            {error && (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            <PriceChart
              data={sortedPriceHistory}
              isLoading={isLoading}
              meta={results?.meta}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {results ? results.offers.length : "—"} offers ·{" "}
                {results?.meta.minPrice
                  ? `from $${results.meta.minPrice}`
                  : "no price range yet"}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                <FlightTakeoffIcon fontSize="inherit" className="mr-1" />
                {results?.query.origin || "---"} →{" "}
                {results?.query.destination || "---"}
                <FlightLandIcon fontSize="inherit" className="ml-1" />
              </span>
            </div>

            <ResultsList
              offers={results?.offers || []}
              isLoading={isLoading}
            />
          </main>
        </div>
      </div>

      <MobileFiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        airlines={airlines}
      />
    </div>
  )
}
