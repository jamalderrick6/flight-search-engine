import type { Airline } from "../lib/types"

type FiltersState = {
  sort: "cheapest" | "shortest" | "least_stops"
  maxStops: number | null
  limit: number
  allowedAirlines: string[]
}

type FiltersPanelProps = {
  filters: FiltersState
  onChange: (next: FiltersState) => void
  airlines: Airline[]
}

const limits = [25, 50, 75, 100]
const sortOptions: Array<{ label: string; value: FiltersState["sort"] }> = [
  { label: "Cheapest", value: "cheapest" },
  { label: "Shortest", value: "shortest" },
  { label: "Least stops", value: "least_stops" },
]
const stopOptions = [
  { label: "Any", value: null },
  { label: "Nonstop", value: 0 },
  { label: "1 stop", value: 1 },
  { label: "2 stops", value: 2 },
]

export default function FiltersPanel({
  filters,
  onChange,
  airlines,
}: FiltersPanelProps) {
  const update = <Key extends keyof FiltersState>(
    key: Key,
    value: FiltersState[Key]
  ) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleAirline = (code: string) => {
    const next = filters.allowedAirlines.includes(code)
      ? filters.allowedAirlines.filter((item) => item !== code)
      : [...filters.allowedAirlines, code]
    update("allowedAirlines", next)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">Sort</p>
        <div className="mt-2 space-y-2 text-sm">
          {sortOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="sort"
                checked={filters.sort === option.value}
                onChange={() => update("sort", option.value)}
                className="accent-orange-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">Max stops</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {stopOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => update("maxStops", option.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filters.maxStops === option.value
                  ? "bg-slate-900 text-white"
                  : "bg-white/70 text-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">Limit</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {limits.map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => update("limit", limit)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filters.limit === limit
                  ? "bg-slate-900 text-white"
                  : "bg-white/70 text-slate-600"
              }`}
            >
              {limit}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Airlines
        </p>
        <div className="mt-3 space-y-2 text-sm">
          {airlines.length === 0 && (
            <p className="text-xs text-slate-400">Search to load airlines.</p>
          )}
          {airlines.map((airline) => (
            <label key={airline.code} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.allowedAirlines.includes(airline.code)}
                onChange={() => toggleAirline(airline.code)}
                className="accent-orange-500"
              />
              <span className="text-slate-700">
                {airline.name}{" "}
                <span className="text-xs text-slate-400">{airline.code}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
