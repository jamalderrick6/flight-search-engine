import { useMemo, useState } from "react"
import type { Offer, Segment } from "../lib/types"

const formatMoney = (value: number, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatTime = (value: string | null | undefined) => {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export default function OfferCard({ offer }: { offer: Offer }) {
  const [expanded, setExpanded] = useState(false)
  const first = offer.segments[0]
  const last = offer.segments[offer.segments.length - 1]
  const route = offer.segments.map((segment) => segment.from).concat(last?.to || "")
  const airlines =
    typeof offer.airlines[0] === "string"
      ? (offer.airlines as string[]).join(", ")
      : (offer.airlines as { code: string; name: string }[])
          .map((airline) => airline.name)
          .join(", ")

  const segmentDetails = useMemo(() => {
    return offer.segments.map((segment, index) => {
      const next = offer.segments[index + 1]
      let layoverMinutes = 0
      if (segment.arriveAt && next?.departAt) {
        const arrive = new Date(segment.arriveAt).getTime()
        const depart = new Date(next.departAt).getTime()
        if (!Number.isNaN(arrive) && !Number.isNaN(depart)) {
          layoverMinutes = Math.max(0, Math.round((depart - arrive) / 60000))
        }
      }

      const aircraft =
        (segment as Segment & { aircraftType?: string }).aircraft ||
        (segment as Segment & { aircraftType?: string }).aircraftType ||
        null

      return {
        segment,
        layoverMinutes,
        layoverAirport: next?.from || null,
        aircraft,
      }
    })
  }, [offer.segments])

  return (
    <div className="h-[200px] rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-100 transition-shadow hover:shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">Total fare</p>
          <p className="text-2xl font-semibold text-slate-900">
            {formatMoney(offer.price.total, offer.price.currency)}
          </p>
        </div>
        <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          {offer.stops === 0 ? "Nonstop" : `${offer.stops} stop`}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Route</p>
          <p className="mt-1 font-medium text-slate-800">{route.join(" → ")}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Timing</p>
          <p className="mt-1 font-medium text-slate-800">
            {formatTime(offer.departAt)} — {formatTime(offer.arriveAt)}
          </p>
          <p className="text-xs text-slate-400">{formatDuration(offer.durationMinutes)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Airlines</p>
          <p className="mt-1 font-medium text-slate-800">{airlines || "—"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Segments:</span>{" "}
        {first?.from} → {last?.to} ({offer.segments.length} legs)
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="mt-3 text-xs font-semibold text-orange-500 transition hover:text-orange-400"
      >
        {expanded ? "Hide details" : "View details"}
      </button>

      <div
        className={`mt-3 overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-600">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">
            Segment details
          </p>
          <div className="mt-3 space-y-3">
            {segmentDetails.map((detail, index) => (
              <div key={`${offer.id}-seg-${index}`} className="space-y-1">
                <p className="font-semibold text-slate-700">
                  {detail.segment.from} → {detail.segment.to}
                </p>
                <p>
                  {formatTime(detail.segment.departAt)} —{" "}
                  {formatTime(detail.segment.arriveAt)} ·{" "}
                  {detail.segment.airline || "—"}{" "}
                  {detail.segment.flightNumber
                    ? `#${detail.segment.flightNumber}`
                    : ""}
                </p>
                {detail.aircraft && (
                  <p className="text-[11px] text-slate-400">
                    Aircraft: {detail.aircraft}
                  </p>
                )}
                {detail.layoverAirport && detail.layoverMinutes > 0 && (
                  <p className="text-[11px] text-slate-400">
                    Layover in {detail.layoverAirport}: {formatDuration(detail.layoverMinutes)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
