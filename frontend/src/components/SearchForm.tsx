import type { CabinClass } from "../lib/types"
import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff"
import FlightLandIcon from "@mui/icons-material/FlightLand"
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth"
import PeopleIcon from "@mui/icons-material/People"
import AirlineSeatReclineNormalIcon from "@mui/icons-material/AirlineSeatReclineNormal"
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange"
import SearchIcon from "@mui/icons-material/Search"

type SearchFormValues = {
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  adults: number
  cabin: CabinClass
  currency: string
}

type SearchFormProps = {
  values: SearchFormValues
  onChange: (next: SearchFormValues) => void
  onSubmit: () => void
  isLoading: boolean
}

const cabins: CabinClass[] = [
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "FIRST",
]

type PlaceOption = {
  code: string
  label: string
  city?: string
  country?: string
  airportName?: string
}

async function fetchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<PlaceOption[]> {
  const apiBase =
    import.meta.env.VITE_API_BASE?.toString() || "http://localhost:8000"
  const url = new URL("/api/places/autocomplete", apiBase)
  url.searchParams.set("q", query)
  url.searchParams.set("limit", "8")
  const response = await fetch(url.toString(), { signal })
  if (!response.ok) return []
  const payload = await response.json()
  return Array.isArray(payload?.results) ? payload.results : []
}

function normalizePlaceInput(value: string): string {
  // Allow free-typing, but keep it predictable for backend.
  return value.trim().toUpperCase().slice(0, 8)
}

export default function SearchForm({
  values,
  onChange,
  onSubmit,
  isLoading,
}: SearchFormProps) {
  const roundTrip = Boolean(values.returnDate)
  const today = new Date()
  const todayIso = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  )
    .toISOString()
    .slice(0, 10)

  const update = (key: keyof SearchFormValues, value: string | number | null) => {
    onChange({ ...values, [key]: value })
  }

  const [activeField, setActiveField] = useState<"origin" | "destination" | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLFormElement | null>(null)
  const [placeResults, setPlaceResults] = useState<{
    origin: PlaceOption[]
    destination: PlaceOption[]
  }>({ origin: [], destination: [] })
  const [loadingPlaces, setLoadingPlaces] = useState(false)

  const suggestions = useMemo(() => {
    if (!activeField) return []
    return placeResults[activeField]
  }, [activeField, placeResults])

  useEffect(() => {
    // reset highlight when suggestions change
    setHighlightIndex(0)
  }, [activeField, suggestions.length])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) {
        setActiveField(null)
      }
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
  }, [])

  useEffect(() => {
    if (!activeField) return
    const value = activeField === "origin" ? values.origin : values.destination
    const query = value.trim()
    if (query.length < 2) {
      setPlaceResults((prev) => ({ ...prev, [activeField]: [] }))
      return
    }

    const controller = new AbortController()
    setLoadingPlaces(true)
    const timeout = window.setTimeout(async () => {
      try {
        const results = await fetchPlaces(query, controller.signal)
        setPlaceResults((prev) => ({ ...prev, [activeField]: results }))
      } catch {
        setPlaceResults((prev) => ({ ...prev, [activeField]: [] }))
      } finally {
        setLoadingPlaces(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [activeField, values.origin, values.destination])

  const applySuggestion = (field: "origin" | "destination", opt: PlaceOption) => {
    onChange({ ...values, [field]: opt.code })
    setActiveField(null)
  }

  const handleTypeaheadKeyDown = (
    field: "origin" | "destination",
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (!suggestions.length) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1))
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (event.key === "Enter") {
      // If dropdown open, Enter selects highlighted option
      // (unless user typed a full code and wants submit; this keeps UX predictable)
      event.preventDefault()
      const opt = suggestions[highlightIndex]
      if (opt) applySuggestion(field, opt)
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setActiveField(null)
    }
  }

  return (
    <form
      ref={containerRef}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Origin
          </label>
          <div className="relative">
            <FlightTakeoffIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={values.origin}
              onFocus={() => setActiveField("origin")}
              onBlur={() => {
                // small delay so clicking an option still works
                window.setTimeout(() => {
                  setActiveField((f) => (f === "origin" ? null : f))
                }, 120)
              }}
              onKeyDown={(e) => handleTypeaheadKeyDown("origin", e)}
              onChange={(event) => update("origin", normalizePlaceInput(event.target.value))}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 py-2 pl-11 pr-4 text-sm focus:border-orange-400 focus:outline-none"
              placeholder="NYC or JFK"
              autoComplete="off"
              inputMode="text"
            />

            {activeField === "origin" ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {loadingPlaces && (
                  <div className="px-4 py-3 text-xs text-slate-400">Searching...</div>
                )}
                {!loadingPlaces && suggestions.length === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-400">
                    No matches yet.
                  </div>
                )}
                {!loadingPlaces &&
                  suggestions.map((opt, i) => (
                    <button
                      key={opt.code + opt.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion("origin", opt)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                        i === highlightIndex ? "bg-slate-50" : ""
                      }`}
                    >
                      <span className="text-slate-900">{opt.label}</span>
                      <span className="ml-3 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {opt.code}
                      </span>
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Destination
          </label>
          <div className="relative">
            <FlightLandIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={values.destination}
              onFocus={() => setActiveField("destination")}
              onBlur={() => {
                window.setTimeout(() => {
                  setActiveField((f) => (f === "destination" ? null : f))
                }, 120)
              }}
              onKeyDown={(e) => handleTypeaheadKeyDown("destination", e)}
              onChange={(event) => update("destination", normalizePlaceInput(event.target.value))}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 py-2 pl-11 pr-4 text-sm focus:border-orange-400 focus:outline-none"
              placeholder="NBO"
              autoComplete="off"
              inputMode="text"
            />

            {activeField === "destination" ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {loadingPlaces && (
                  <div className="px-4 py-3 text-xs text-slate-400">Searching...</div>
                )}
                {!loadingPlaces && suggestions.length === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-400">
                    No matches yet.
                  </div>
                )}
                {!loadingPlaces &&
                  suggestions.map((opt, i) => (
                    <button
                      key={opt.code + opt.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion("destination", opt)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                        i === highlightIndex ? "bg-slate-50" : ""
                      }`}
                    >
                      <span className="text-slate-900">{opt.label}</span>
                      <span className="ml-3 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {opt.code}
                      </span>
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Depart
          </label>
          <div className="relative">
            <CalendarMonthIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="date"
              value={values.departDate}
              min={todayIso}
              onChange={(event) => {
                const nextDate = event.target.value
                const nextReturn =
                  values.returnDate && values.returnDate < nextDate
                    ? nextDate
                    : values.returnDate
                onChange({
                  ...values,
                  departDate: nextDate,
                  returnDate: nextReturn,
                })
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 py-2 pl-11 pr-4 text-sm focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-widest text-slate-500">
              Return
            </label>
            <button
              type="button"
              className="text-xs font-semibold text-orange-500"
              onClick={() => update("returnDate", roundTrip ? null : values.departDate)}
            >
              {roundTrip ? "One-way" : "Round-trip"}
            </button>
          </div>
          <div className="relative">
            <CalendarMonthIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="date"
              value={values.returnDate || ""}
              min={values.departDate || todayIso}
              onChange={(event) => update("returnDate", event.target.value)}
              className={`w-full rounded-2xl border py-2 pl-11 pr-4 text-sm focus:outline-none ${
                roundTrip
                  ? "border-slate-200 bg-white/80 focus:border-orange-400"
                  : "border-slate-100 bg-slate-100 text-slate-400"
              }`}
              disabled={!roundTrip}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Adults
          </label>
          <div className="relative">
            <PeopleIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="number"
              min={1}
              max={8}
              value={values.adults}
              onChange={(event) => update("adults", Number(event.target.value))}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 py-2 pl-11 pr-4 text-sm focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Cabin
          </label>
          <div className="relative">
            <AirlineSeatReclineNormalIcon
              fontSize="small"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={values.cabin}
              onChange={(event) => update("cabin", event.target.value as CabinClass)}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 py-2 pl-11 pr-4 text-sm focus:border-orange-400 focus:outline-none"
            >
              {cabins.map((cabin) => (
                <option key={cabin} value={cabin}>
                  {cabin.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-200 disabled:opacity-50 transition hover:bg-orange-400"
        disabled={isLoading || !values.origin.trim() || !values.destination.trim()}
      >
        <SearchIcon fontSize="small" />
        {isLoading ? "Searching..." : "Search flights"}
      </button>
    </form>
  )
}
