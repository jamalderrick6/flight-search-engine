import type { CabinClass } from "../lib/types"
import { useEffect, useMemo, useRef, useState } from "react"

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
}

const PLACE_OPTIONS: PlaceOption[] = [
  { code: "NYC", label: "New York (NYC) — All airports" },
  { code: "JFK", label: "New York — John F. Kennedy (JFK)" },
  { code: "EWR", label: "Newark (EWR)" },
  { code: "LGA", label: "New York — LaGuardia (LGA)" },
  { code: "LON", label: "London (LON) — All airports" },
  { code: "LHR", label: "London — Heathrow (LHR)" },
  { code: "LGW", label: "London — Gatwick (LGW)" },
  { code: "PAR", label: "Paris (PAR) — All airports" },
  { code: "CDG", label: "Paris — Charles de Gaulle (CDG)" },
  { code: "ORY", label: "Paris — Orly (ORY)" },
  { code: "NBO", label: "Nairobi (NBO)" },
  { code: "LOS", label: "Lagos (LOS)" },
  { code: "DXB", label: "Dubai (DXB)" },
  { code: "DOH", label: "Doha (DOH)" },
]

function filterPlaces(query: string): PlaceOption[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  return PLACE_OPTIONS.filter((p) =>
    p.code.includes(q) || p.label.toUpperCase().includes(q)
  ).slice(0, 8)
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

  const suggestions = useMemo(() => {
    if (!activeField) return []
    const value = activeField === "origin" ? values.origin : values.destination
    return filterPlaces(value)
  }, [activeField, values.origin, values.destination])

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

  const applySuggestion = (field: "origin" | "destination", opt: PlaceOption) => {
    onChange({ ...values, [field]: opt.code })
    setActiveField(null)
  }

  const handleTypeaheadKeyDown = (
    field: "origin" | "destination",
    event: React.KeyboardEvent<HTMLInputElement>
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
              className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
              placeholder="NYC or JFK"
              autoComplete="off"
              inputMode="text"
            />

            {activeField === "origin" && suggestions.length > 0 ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {suggestions.map((opt, i) => (
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
              className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
              placeholder="NBO"
              autoComplete="off"
              inputMode="text"
            />

            {activeField === "destination" && suggestions.length > 0 ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {suggestions.map((opt, i) => (
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
            className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
          />
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
          <input
            type="date"
            value={values.returnDate || ""}
            min={values.departDate || todayIso}
            onChange={(event) => update("returnDate", event.target.value)}
            className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none ${
              roundTrip
                ? "border-slate-200 bg-white/80 focus:border-orange-400"
                : "border-slate-100 bg-slate-100 text-slate-400"
            }`}
            disabled={!roundTrip}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Adults
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={values.adults}
            onChange={(event) => update("adults", Number(event.target.value))}
            className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Cabin
          </label>
          <select
            value={values.cabin}
            onChange={(event) => update("cabin", event.target.value as CabinClass)}
            className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
          >
            {cabins.map((cabin) => (
              <option key={cabin} value={cabin}>
                {cabin.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">
            Currency
          </label>
          <input
            value={values.currency}
            onChange={(event) => update("currency", event.target.value.toUpperCase())}
            className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none"
            placeholder="USD"
          />
        </div>
      </div>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-orange-400"
        disabled={isLoading}
      >
        {isLoading ? "Searching..." : "Search flights"}
      </button>
    </form>
  )
}
