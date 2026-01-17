import { useEffect, useRef, useState } from "react"
import type { Offer } from "../lib/types"
import OfferCard from "./OfferCard"

type ResultsListProps = {
  offers: Offer[]
  isLoading: boolean
}

export default function ResultsList({ offers, isLoading }: ResultsListProps) {
  const [showSkeleton, setShowSkeleton] = useState(isLoading)
  const itemHeight = 200
  const overscan = 3
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => setShowSkeleton(true), 0)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => setShowSkeleton(false), 250)
    return () => clearTimeout(timeout)
  }, [isLoading])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const update = () => setViewportHeight(node.clientHeight || 600)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const totalHeight = offers.length * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(
    offers.length,
    startIndex + Math.ceil(viewportHeight / itemHeight) + overscan * 2
  )
  const visible = offers.slice(startIndex, endIndex)

  if (showSkeleton) {
    return (
      <div className="space-y-4 transition-opacity duration-300 opacity-100">
        {[0, 1, 2].map((index) => (
          <div
            key={`skeleton-${index}`}
            className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-lg shadow-slate-100 animate-pulse"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="h-3 w-20 rounded-full bg-slate-200" />
                <div className="h-8 w-32 rounded-full bg-slate-200" />
              </div>
              <div className="h-6 w-20 rounded-full bg-slate-200" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="h-4 rounded-full bg-slate-100" />
              <div className="h-4 rounded-full bg-slate-100" />
              <div className="h-4 rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-8 rounded-2xl bg-slate-100" />
            <div className="mt-3 h-3 w-24 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    )
  }

  if (!offers.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
        No results match these filters.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-white/70 bg-white/60 shadow-lg shadow-slate-100">
      <div
        ref={containerRef}
        className="relative h-[65vh] overflow-auto px-4 py-4"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visible.map((offer, index) => {
            const top = (startIndex + index) * itemHeight
            return (
              <div
                key={offer.id}
                style={{
                  position: "absolute",
                  top,
                  left: 0,
                  right: 0,
                  height: itemHeight,
                  paddingBottom: 16,
                }}
              >
                <OfferCard offer={offer} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
