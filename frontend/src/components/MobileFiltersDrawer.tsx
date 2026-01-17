import FiltersPanel from "./FiltersPanel"
import type { Airline } from "../lib/types"

type FiltersState = {
  sort: "cheapest" | "shortest" | "least_stops"
  maxStops: number | null
  limit: number
  allowedAirlines: string[]
}

type MobileFiltersDrawerProps = {
  open: boolean
  onClose: () => void
  filters: FiltersState
  onChange: (next: FiltersState) => void
  airlines: Airline[]
}

export default function MobileFiltersDrawer({
  open,
  onClose,
  filters,
  onChange,
  airlines,
}: MobileFiltersDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm sm:hidden">
      <div className="h-full w-4/5 rounded-l-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Filters</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold"
          >
            Close
          </button>
        </div>
        <FiltersPanel filters={filters} onChange={onChange} airlines={airlines} />
      </div>
    </div>
  )
}
