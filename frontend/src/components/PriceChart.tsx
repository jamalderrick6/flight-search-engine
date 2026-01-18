import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import ShowChartIcon from "@mui/icons-material/ShowChart"
import type { FlightMeta, PricePoint } from "../lib/types"

type PriceChartProps = {
  data: PricePoint[]
  isLoading: boolean
  selectedDate?: string | null
  meta?: FlightMeta | null
}

const formatCurrency = (value: number, compact = true) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value)
}

const formatDateLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
}

export default function PriceChart({
  data,
  isLoading,
  selectedDate,
  meta,
}: PriceChartProps) {
  const [showSkeleton, setShowSkeleton] = useState(isLoading)

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => setShowSkeleton(true), 0)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => setShowSkeleton(false), 250)
    return () => clearTimeout(timeout)
  }, [isLoading])

  const series = useMemo(() => {
    return [...data]
      .filter((p) => p && typeof p.price === "number" && !!p.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [data])

  const priceHistoryPoints = meta?.priceHistoryPoints ?? series.length
  const priceHistorySource = meta?.priceHistorySource ?? "none"
  const priceHistoryFilterAware = meta?.priceHistoryFilterAware ?? false
  const cached = meta?.cached ?? false
  const cacheAgeSeconds = meta?.cacheAgeSeconds ?? null

  const sourceLabelMap: Record<string, string> = {
    offers: "Live prices (based on current results)",
    google_price_graph: "Market trend (not filter-specific)",
    search_everywhere: "Estimated trend (fallback)",
    none: "No price history available",
  }
  const sourceLabel = sourceLabelMap[priceHistorySource] || sourceLabelMap.none

  if (showSkeleton) {
    return (
      <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-lg shadow-orange-100">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-32 rounded-full bg-slate-200" />
          <div className="h-3 w-20 rounded-full bg-slate-200" />
        </div>
        <div className="h-60 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  if (series.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-400">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          {sourceLabel}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {priceHistoryPoints < 2
            ? "Not enough history to estimate a trend for these filters."
            : "No price history available."}
        </p>
      </div>
    )
  }

  const prices = series.map((point) => point.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  const uniqueDates = new Set(series.map((point) => point.date))
  const hasTrend = uniqueDates.size >= 2 && series.length >= 2
  const isSpot = !hasTrend

  const minPoint = hasTrend ? series.find((point) => point.price === minPrice) : null

  const targetDate = selectedDate || null
  const selectedPoint = targetDate
    ? series.find((point) => point.date === targetDate)
    : null

  const tickInterval = Math.max(0, Math.ceil(series.length / 6) - 1)

  const firstDate = series[0]?.date
  const lastDate = series[series.length - 1]?.date
  const spanDays = (() => {
    if (!firstDate || !lastDate) return null
    const a = new Date(firstDate).getTime()
    const b = new Date(lastDate).getTime()
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  })()

  const volatilityPct = (() => {
    if (!hasTrend || !minPrice || minPrice <= 0) return null
    const pct = ((maxPrice - minPrice) / minPrice) * 100
    return Number.isFinite(pct) ? pct : null
  })()

  const showVolatility =
    hasTrend &&
    priceHistoryPoints >= 5 &&
    volatilityPct !== null &&
    volatilityPct >= 0.5 &&
    (priceHistorySource === "offers" || priceHistorySource === "google_price_graph")

  const headerTitle = sourceLabel
  const headerTag = hasTrend ? "price trend" : "spot price"

  const pointsLabel = `${series.length} point${series.length === 1 ? "" : "s"}`
  const spanLabel = spanDays !== null ? `over ${spanDays} day${spanDays === 1 ? "" : "s"}` : ""

  const headerSubtext =
    priceHistoryPoints < 2
      ? "Not enough history to estimate a trend for these filters."
      : hasTrend
        ? `Min ${formatCurrency(minPrice)} · Max ${formatCurrency(maxPrice)} · ${pointsLabel}${spanLabel ? ` (${spanLabel})` : ""}`
        : `No trend available — showing best price for ${targetDate ? formatDateLabel(targetDate) : "the selected date"}.`

  const volatilityNote = showVolatility
    ? `Prices fluctuate ±${volatilityPct!.toFixed(0)}%${priceHistorySource === "google_price_graph" ? " (market-wide)." : "."}`
    : null

  const marketNote =
    priceHistoryPoints >= 2 && !priceHistoryFilterAware && priceHistorySource !== "none"
      ? "Trend is market-wide and doesn’t reflect filters like stops/airlines."
      : null

  return (
    <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-lg shadow-orange-100 min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <ShowChartIcon fontSize="small" />
            {headerTitle}
          </h3>
          <p className="text-xs text-slate-400">
            {headerSubtext}
          </p>
          {(volatilityNote || marketNote || (cached && cacheAgeSeconds !== null)) && (
            <p className="mt-1 text-xs text-slate-400">
              {volatilityNote}
              {volatilityNote && marketNote ? " " : ""}
              {marketNote}
              {(volatilityNote || marketNote) && cached && cacheAgeSeconds !== null ? " · " : ""}
              {cached && cacheAgeSeconds !== null
                ? `Cached (updated ~${cacheAgeSeconds}s ago)`
                : ""}
            </p>
          )}
        </div>
        <span className="text-xs uppercase tracking-widest text-slate-400">
          {headerTag}
        </span>
      </div>
      <div className="h-60 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              stroke="#c4c9d4"
              interval={tickInterval}
              tickFormatter={formatDateLabel}
              label={{
                value: "Date",
                position: "insideBottom",
                offset: -5,
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#c4c9d4"
              width={48}
              tickFormatter={(value) => formatCurrency(Number(value))}
              label={{
                value: "Price",
                angle: -90,
                position: "insideLeft",
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(255,255,255,0.95)",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.1)",
              }}
              labelFormatter={(label) => formatDateLabel(String(label))}
              formatter={(value) => {
                const numeric = typeof value === "number" ? value : Number(value)
                return [formatCurrency(Number.isFinite(numeric) ? numeric : 0, false), "Price"]
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={isSpot ? "transparent" : "#ff6b3d"}
              strokeWidth={3}
              dot={{ r: isSpot ? 6 : 3, fill: "#ff6b3d" }}
              activeDot={{ r: 6 }}
              isAnimationActive={!isSpot}
              animationDuration={500}
            />
            {hasTrend && minPoint && (
              <ReferenceDot
                x={minPoint.date}
                y={minPoint.price}
                r={6}
                fill="#0f172a"
                stroke="#fff"
                strokeWidth={2}
                label={{
                  value: "Cheapest",
                  position: "top",
                  fill: "#0f172a",
                  fontSize: 11,
                }}
              />
            )}
            {selectedPoint && (
              <ReferenceDot
                x={selectedPoint.date}
                y={selectedPoint.price}
                r={5}
                fill="#35c0b4"
                stroke="#fff"
                strokeWidth={2}
                label={{
                  value: "Selected",
                  position: "right",
                  fill: "#0f766e",
                  fontSize: 11,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
