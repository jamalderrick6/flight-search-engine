import type { FlightSearchParams, FlightSearchResponse } from "./types"

const API_BASE =
  import.meta.env.VITE_API_BASE?.toString() || "http://localhost:8000"

export async function fetchFlights(
  params: FlightSearchParams,
  signal?: AbortSignal
): Promise<FlightSearchResponse> {
  const response = await fetch(`${API_BASE}/api/flights/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    signal,
  })

  if (!response.ok) {
    let message = "Request failed."
    try {
      const payload = await response.json()
      if (payload?.message) {
        message = payload.message
      }
    } catch {
      message = response.statusText || message
    }
    throw new Error(message)
  }

  return response.json()
}
