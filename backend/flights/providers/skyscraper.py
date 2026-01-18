# /Users/wmonk/Documents/projects_repo/flight_search_engine/backend/flights/providers/skyscraper.py
import logging
import re
import hashlib
import json
import time
from datetime import datetime
import requests
from django.conf import settings
from django.core.cache import cache

from flights.providers.base import FlightProvider, ProviderError

logger = logging.getLogger(__name__)

# RapidAPI: flights-sky

SKYSCRAPER_EVERYWHERE_URL = "https://flights-sky.p.rapidapi.com/flights/search-everywhere"

# Google price graph endpoints (multi-day price series around the selected date)
GOOGLE_PRICE_GRAPH_ONE_WAY_URL = "https://flights-sky.p.rapidapi.com/google/price-graph/for-one-way"
GOOGLE_PRICE_GRAPH_ROUNDTRIP_URL = "https://flights-sky.p.rapidapi.com/google/price-graph/for-roundtrip"

RESPONSE_CACHE_TTL = 60 * 5
GRAPH_CACHE_TTL = 60 * 15



SKYSCRAPER_API_HOST = "flights-sky.p.rapidapi.com"

# Google endpoints often require airport IATA codes (e.g. JFK) not city/entity ids (e.g. NYCA).
# We'll do best-effort mapping for common city codes.
CITY_TO_DEFAULT_AIRPORT = {
    "NYC": "JFK",
    "LON": "LHR",
    "PAR": "CDG",
}

def _to_everywhere_entity(value: str | None) -> str | None:
    """search-everywhere expects Skyscanner entity ids like NYCA.

    Best-effort:
    - If value is 3-letter (NYC), convert to NYC + 'A' (NYCA)
    - If already 4-letter ending with 'A' (NYCA), keep as-is
    """
    if not value or not isinstance(value, str):
        return None
    v = value.strip().upper()
    if len(v) == 3:
        return f"{v}A"
    return v

def _to_google_airport(value: str | None) -> str | None:
    """google/flights endpoints tend to require airport IATA codes (JFK) rather than entity ids.

    Best-effort:
    - If value is entity id like NYCA -> NYC -> map to default airport (JFK)
    - If value is city code like NYC -> map to default airport (JFK)
    - Otherwise keep as-is (assume already airport code like NBO, JFK)
    """
    if not value or not isinstance(value, str):
        return None
    v = value.strip().upper()

    # Convert entityId -> city
    if len(v) == 4 and v.endswith("A"):
        v = v[:3]

    return CITY_TO_DEFAULT_AIRPORT.get(v, v)

PRICE_RE = re.compile(r"[^0-9.]")
AIRLINE_CODE_RE = re.compile(r"\*([A-Z0-9]{2,3})\s*$")


def _cache_key(prefix: str, payload: dict) -> str:
    """Stable cache key for request payloads."""
    try:
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    except TypeError:
        raw = str(payload)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def _parse_price(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = PRICE_RE.sub("", value)
        return float(cleaned) if cleaned else 0.0
    return 0.0


def _extract_airline_code(result_id: str | None) -> str | None:
    """Extract airline code from id tail e.g. ...*KQ -> KQ"""
    if not result_id or not isinstance(result_id, str):
        return None
    m = AIRLINE_CODE_RE.search(result_id)
    return m.group(1) if m else None


def _build_headers(api_key: str) -> dict:
    return {
        "Accept": "application/json",
        "x-rapidapi-host": SKYSCRAPER_API_HOST,
        "x-rapidapi-key": api_key,
    }


def _short_offer_id(vendor_id: str) -> str:
    return "off_" + hashlib.sha1(vendor_id.encode()).hexdigest()[:12]


def _compute_duration_minutes(segments):
    total = 0
    for s in segments:
        total += s.get("durationMinutes", 0)
    return total


def _dedupe_offers(offers):
    seen = {}
    deduped = []

    for o in offers:
        key = (
            o["price"]["total"],
            o["stops"],
            o["departAt"],
            o["arriveAt"],
            tuple(
                (
                    s["from"],
                    s["to"],
                    s["departAt"],
                    s["arriveAt"],
                    s["airline"],
                )
                for s in o["segments"]
            ),
        )

        if key not in seen:
            seen[key] = True
            deduped.append(o)

    return deduped


def _sort_offers(offers, sort_by):
    if sort_by == "cheapest":
        return sorted(offers, key=lambda o: o["price"]["total"])
    if sort_by == "shortest":
        return sorted(offers, key=lambda o: o["durationMinutes"])
    if sort_by == "least_stops":
        return sorted(offers, key=lambda o: o["stops"])
    return offers


def _offer_depart_date(offer) -> str | None:
    segments = offer.get("segments") or []
    if not segments:
        return None
    depart_at = segments[0].get("departAt")
    if not depart_at or not isinstance(depart_at, str):
        return None
    return depart_at.split("T")[0]


def _build_offer_curve(offers) -> list[dict]:
    price_by_date: dict[str, float] = {}
    for offer in offers:
        date_key = _offer_depart_date(offer)
        if not date_key:
            continue
        price_total = offer.get("price", {}).get("total")
        if not isinstance(price_total, (int, float)):
            continue
        prev = price_by_date.get(date_key)
        if prev is None or price_total < prev:
            price_by_date[date_key] = float(price_total)
    return [{"date": d, "price": p} for d, p in sorted(price_by_date.items())]


def _series_date_span_days(series: list[dict]) -> int:
    dates = []
    for point in series:
        if not isinstance(point, dict):
            continue
        date_str = point.get("date")
        if not isinstance(date_str, str):
            continue
        try:
            dates.append(datetime.fromisoformat(date_str).date())
        except ValueError:
            continue
    if len(dates) < 2:
        return 0
    return (max(dates) - min(dates)).days


def _should_override_curve(offers_curve: list[dict], existing_curve: list[dict]) -> bool:
    if len(offers_curve) < 2:
        return False
    if not existing_curve:
        return True
    if len(offers_curve) >= 5:
        return True
    if len(offers_curve) > len(existing_curve):
        return _series_date_span_days(offers_curve) > _series_date_span_days(existing_curve)
    return False


def _google_curve_cache_key(params: dict) -> str:
    """Cache key for multi-day price curves.

    Use airport ids (departureId/arrivalId) because Google endpoints are airport-based.
    """
    return (
        "flights:skyscraper:google_curve:"
        f"{params.get('departureId')}:{params.get('arrivalId')}:"
        f"{params.get('departDate')}:{params.get('returnDate') or ''}:"
        f"{params.get('currency') or ''}"
    )


def _request_json(url: str, *, query: dict, headers: dict, timeout: int = 25) -> dict:
    try:
        response = requests.get(url, params=query, headers=headers, timeout=timeout)
    except requests.RequestException as exc:
        logger.exception("Sky-Scraper request failed.")
        raise ProviderError(
            "Sky-Scraper request failed.",
            status_code=502,
            details={"error": str(exc)},
        )

    if response.status_code >= 400:
        try:
            details = response.json()
        except ValueError:
            details = {"error": response.text}
        logger.warning(
            "Sky-Scraper error response",
            extra={"status_code": response.status_code, "details": details},
        )
        raise ProviderError(
            "Sky-Scraper returned an error.",
            status_code=response.status_code,
            details=details,
        )

    try:
        return response.json()
    except ValueError:
        raise ProviderError("Sky-Scraper response was not valid JSON.")


def _pick_root_obj(payload: object) -> dict:
    """
    Some endpoints respond as a single object, others as [ { ... } ].
    Normalize into a dict.
    """
    if isinstance(payload, list) and payload:
        return payload[0] if isinstance(payload[0], dict) else {}
    return payload if isinstance(payload, dict) else {}


def _iso_dt(d: str | None, t: str | None) -> str | None:
    if not d or not isinstance(d, str):
        return None

    tt: str | None = None
    if t and isinstance(t, str):
        raw = t.strip()
        if raw.lower() != "null" and raw != "":
            # Handle odd cases we sometimes see like "null:05" / "null:50" meaning "00:05" / "00:50".
            raw = re.sub(r"^null:(\d{2})$", r"00:\1", raw, flags=re.IGNORECASE)
            # Some responses give HH:MM, sometimes HH:MM:SS
            if len(raw) == 5:
                raw = f"{raw}:00"
            # Validate basic HH:MM(:SS) shape; if not valid, drop it.
            if re.match(r"^\d{2}:\d{2}(:\d{2})?$", raw):
                tt = raw

    return f"{d}T{tt or '00:00:00'}"


def _iter_google_flights(data: dict) -> list[dict]:
    """
    flights-sky 'google/flights/*' shapes can vary.
    This tries the most common containers.
    """
    if not isinstance(data, dict):
        return []

    # Common patterns seen in these APIs:
    # data.topFlights, data.otherFlights, data.flights, data.itineraries.results, etc.
    candidates = [
        data.get("topFlights"),
        data.get("otherFlights"),
        data.get("flights"),
        data.get("results"),
    ]

    # Sometimes: data -> itineraries -> results
    itineraries = data.get("itineraries")
    if isinstance(itineraries, dict):
        candidates.append(itineraries.get("results"))

    out: list[dict] = []
    for c in candidates:
        if isinstance(c, list):
            out.extend([x for x in c if isinstance(x, dict)])

    return out


def _normalize_google_offers(payload: dict, query_params: dict) -> dict:
    root = _pick_root_obj(payload)

    # API sometimes returns {status:false, errors:{...}}
    if root.get("status") is False:
        raise ProviderError(
            "Google Flights endpoint returned an error.",
            status_code=400,
            details={
                "message": root.get("message"),
                "errors": root.get("errors"),
            },
        )

    data = root.get("data") if isinstance(root.get("data"), dict) else {}
    flights = _iter_google_flights(data)

    normalized_offers: list[dict] = []
    price_values: list[float] = []
    stops_counts = {"0": 0, "1": 0, "2+": 0}
    airlines_set: set[str] = set()

    default_currency = (
        query_params.get("currency")
        or getattr(settings, "DEFAULT_CURRENCY", "USD")
    )

    # Optional: cap number of offers returned to reduce payload size
    limit = query_params.get("limit")
    try:
        limit = int(limit) if limit is not None else None
    except (TypeError, ValueError):
        limit = None

    if limit and limit > 0:
        flights = flights[:limit]

    for idx, f in enumerate(flights):
        # Price can appear as f.price (number) or f.price.formatted, etc.
        price_total = _parse_price(
            f.get("price")
            or (f.get("pricing", {}) if isinstance(f.get("pricing"), dict) else {}).get("price")
            or (f.get("price", {}) if isinstance(f.get("price"), dict) else {}).get("amount")
            or (f.get("price", {}) if isinstance(f.get("price"), dict) else {}).get("formatted")
        )

        # Segments often exist directly: f.segments
        segments_raw = f.get("segments")
        if not isinstance(segments_raw, list):
            segments_raw = []

        offer_segments: list[dict] = []
        seg_airlines: set[str] = set()
        total_duration = 0

        for s in segments_raw:
            if not isinstance(s, dict):
                continue

            from_code = (
                s.get("departureAirportCode")
                or s.get("from")
                or s.get("origin")
                or query_params.get("origin")
            )
            to_code = (
                s.get("arrivalAirportCode")
                or s.get("to")
                or s.get("destination")
                or query_params.get("destination")
            )

            # Airline can be a string code or a dict like {airlineCode, airlineName, flightNumber}
            airline_obj = s.get("airline")
            airline_code = s.get("airlineCode")
            airline_name = None
            flight_number = s.get("flightNumber")

            if isinstance(airline_obj, dict):
                airline_code = airline_code or airline_obj.get("airlineCode")
                airline_name = airline_obj.get("airlineName")
                flight_number = flight_number or airline_obj.get("flightNumber")
            elif isinstance(airline_obj, str):
                airline_code = airline_code or airline_obj

            if airline_code:
                seg_airlines.add(str(airline_code))

            seg_dur = s.get("durationMinutes")
            seg_dur = int(seg_dur) if isinstance(seg_dur, (int, float)) else 0
            total_duration += seg_dur

            offer_segments.append(
                {
                    "from": from_code,
                    "to": to_code,
                    "departAt": _iso_dt(s.get("departureDate"), s.get("departureTime")),
                    "arriveAt": _iso_dt(s.get("arrivalDate"), s.get("arrivalTime")),
                    "airlineCode": airline_code,
                    "airlineName": airline_name,
                    "flightNumber": flight_number,
                    "durationMinutes": seg_dur,
                }
            )

        # If no segments array exists, try a leg-based fallback:
        # (some versions return legs -> segments)
        if not offer_segments:
            legs = f.get("legs")
            if isinstance(legs, list):
                for leg in legs:
                    if not isinstance(leg, dict):
                        continue
                    for s in leg.get("segments", []) if isinstance(leg.get("segments"), list) else []:
                        if not isinstance(s, dict):
                            continue
                        from_code = s.get("departureAirportCode") or s.get("from") or query_params.get("origin")
                        to_code = s.get("arrivalAirportCode") or s.get("to") or query_params.get("destination")

                        airline_obj = s.get("airline")
                        airline_code = s.get("airlineCode")
                        airline_name = None
                        flight_number = s.get("flightNumber")

                        if isinstance(airline_obj, dict):
                            airline_code = airline_code or airline_obj.get("airlineCode")
                            airline_name = airline_obj.get("airlineName")
                            flight_number = flight_number or airline_obj.get("flightNumber")
                        elif isinstance(airline_obj, str):
                            airline_code = airline_code or airline_obj

                        if airline_code:
                            seg_airlines.add(str(airline_code))

                        seg_dur = s.get("durationMinutes")
                        seg_dur = int(seg_dur) if isinstance(seg_dur, (int, float)) else 0
                        total_duration += seg_dur

                        offer_segments.append(
                            {
                                "from": from_code,
                                "to": to_code,
                                "departAt": _iso_dt(s.get("departureDate"), s.get("departureTime")),
                                "arriveAt": _iso_dt(s.get("arrivalDate"), s.get("arrivalTime")),
                                "airlineCode": airline_code,
                                "airlineName": airline_name,
                                "flightNumber": flight_number,
                                "durationMinutes": seg_dur,
                            }
                        )

        # Stops: best derived from segments count (more reliable than vendor-provided field)
        calc_stops = max(0, len(offer_segments) - 1) if offer_segments else None
        stops = calc_stops
        if stops is None:
            vendor_stops = f.get("stops")
            stops = int(vendor_stops) if isinstance(vendor_stops, (int, float)) else 0

        if stops == 0:
            stops_counts["0"] += 1
        elif stops == 1:
            stops_counts["1"] += 1
        else:
            stops_counts["2+"] += 1

        airlines = sorted(seg_airlines)
        for a in airlines:
            airlines_set.add(a)

        # Offer-level depart/arrive: take first/last segment
        depart_at = offer_segments[0]["departAt"] if offer_segments else None
        arrive_at = offer_segments[-1]["arriveAt"] if offer_segments else None

        # Duration: prefer explicit flight duration if present
        offer_duration = f.get("durationMinutes")
        if isinstance(offer_duration, (int, float)):
            offer_duration = int(offer_duration)
        else:
            offer_duration = total_duration

        price_values.append(price_total)

        vendor_id = (
            f.get("flightId")
            or f.get("id")
            or f.get("detailToken")
            or f"idx_{idx}"
        )

        # The vendor token/id can be extremely long (often base64). Use a short stable hash
        # as the public offer id to keep API responses small.
        offer_hash = hashlib.md5(str(vendor_id).encode("utf-8")).hexdigest()[:16]

        normalized_offers.append(
            {
                "id": f"off_{offer_hash}",
                "vendorId": vendor_id,
                "price": {"total": price_total, "currency": default_currency},
                "stops": stops,
                "durationMinutes": offer_duration,
                "airlines": airlines,
                "segments": offer_segments,
                "departAt": depart_at,
                "arriveAt": arrive_at,
            }
        )

    min_price = min(price_values) if price_values else None
    max_price = max(price_values) if price_values else None

    return {
        "query": {
            "origin": query_params["origin"],
            "destination": query_params["destination"],
            "departDate": query_params["departDate"],
            "returnDate": query_params.get("returnDate"),
            "adults": query_params["adults"],
            "cabin": query_params["cabin"],
        },
        "offers": normalized_offers,
        "meta": {
            "minPrice": min_price,
            "maxPrice": max_price,
            "airlines": sorted(airlines_set),
            "priceHistory": [],  # we’ll fill this using search-everywhere
            "stopsCounts": stops_counts,
        },
    }


def _extract_flightquote_results(payload: dict) -> list[dict]:
    """Extract `data.flightQuotes.results` from search-everywhere responses."""
    payload = _pick_root_obj(payload)
    if not isinstance(payload, dict):
        return []

    data = payload.get("data")
    if not isinstance(data, dict):
        return []

    flight_quotes = data.get("flightQuotes")
    if not isinstance(flight_quotes, dict):
        return []

    results = flight_quotes.get("results")
    return results if isinstance(results, list) else []


def _normalize_price_history_from_everywhere(payload: dict, query_params: dict) -> list[dict]:
    """
    Keep lowest price per date from /flights/search-everywhere,
    to feed your Recharts price graph.
    """
    results = _extract_flightquote_results(payload)
    price_by_date: dict[str, float] = {}

    for item in results:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, dict):
            continue

        outbound = content.get("outboundLeg")
        if not isinstance(outbound, dict):
            continue

        d = outbound.get("localDepartureDate")
        if not isinstance(d, str) or not d:
            continue

        raw_price = content.get("rawPrice")
        price_total = float(raw_price) if isinstance(raw_price, (int, float)) else _parse_price(content.get("price"))

        prev = price_by_date.get(d)
        if prev is None or price_total < prev:
            price_by_date[d] = price_total

    return [{"date": d, "price": p} for d, p in sorted(price_by_date.items())]


# --- Google price-graph normalization ---
def _normalize_price_history_from_google_price_graph(payload: dict) -> list[dict]:
    """Normalize google/price-graph responses into [{date, price}].

    One-way returns: {"data": [{"departureDate": "YYYY-MM-DD", "price": 123}, ...]}
    Roundtrip returns: {"data": [{"departureDate": "YYYY-MM-DD", "returnDate": "YYYY-MM-DD", "price": 123}, ...]}

    We plot by departureDate; returnDate can be added later if needed.
    """
    root = _pick_root_obj(payload)
    data = root.get("data") if isinstance(root, dict) else None
    if not isinstance(data, list):
        return []

    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        d = item.get("departureDate")
        p = item.get("price")
        if not isinstance(d, str) or not d:
            continue
        if not isinstance(p, (int, float)):
            continue
        out.append({"date": d, "price": float(p)})

    # Dedupe by date (keep lowest) and sort
    by_date: dict[str, float] = {}
    for row in out:
        d = row["date"]
        p = row["price"]
        prev = by_date.get(d)
        if prev is None or p < prev:
            by_date[d] = p

    return [{"date": d, "price": by_date[d]} for d in sorted(by_date.keys())]


class SkyScraperProvider(FlightProvider):
    def search_flights(self, params: dict) -> dict:
        api_key = getattr(settings, "SKY_SCRAPER_API_KEY", None)
        if not api_key:
            raise ProviderError("Sky-Scraper API key is not configured.", status_code=500)

        headers = _build_headers(api_key)

        # ---- Simple caching (fast win) ----
        # Cache by (origin, dest, depart, return, adults, cabin, currency, filters/sort/limit)
        cache_payload = {
            "origin": params.get("origin"),
            "destination": params.get("destination"),
            "departDate": params.get("departDate"),
            "returnDate": params.get("returnDate"),
            "adults": params.get("adults"),
            "cabin": params.get("cabin"),
            "currency": params.get("currency"),
            "sort": params.get("sort"),
            "limit": params.get("limit"),
            "maxStops": params.get("maxStops"),
            "allowedAirlines": params.get("allowedAirlines"),
        }
        ck = _cache_key("flights:skyscraper", cache_payload)
        now_ts = time.time()
        bypass_cache = bool(params.get("bypassCache"))

        if not bypass_cache:
            cached = cache.get(ck)
            if isinstance(cached, dict):
                payload = cached.get("payload") if "payload" in cached else cached
                cached_at = cached.get("cached_at") if "payload" in cached else None
                if isinstance(payload, dict) and payload.get("offers") is not None:
                    meta = payload.get("meta")
                    if isinstance(meta, dict):
                        meta.update(
                            {
                                "cached": True,
                                "cacheAgeSeconds": int(now_ts - cached_at) if cached_at else None,
                                "cacheTtlSeconds": RESPONSE_CACHE_TTL,
                                "priceHistoryPoints": len(meta.get("priceHistory") or []),
                                "priceHistorySource": meta.get("priceHistorySource", "none"),
                                "priceHistoryFilterAware": meta.get("priceHistoryFilterAware", False),
                            }
                        )
                    return payload

        # --- Add roundtrip support ---
        query_params = {}
        # Keep original inputs for fallbacks in segment parsing.
        query_params["origin"] = params.get("origin")
        query_params["destination"] = params.get("destination")

        # Use the helper to convert to airport codes for Google endpoints.
        query_params["departureId"] = _to_google_airport(params.get("origin"))
        query_params["arrivalId"] = _to_google_airport(params.get("destination"))
        query_params["departureDate"] = params["departDate"]
        query_params["adults"] = params["adults"]
        query_params["currency"] = params.get("currency") or getattr(settings, "DEFAULT_CURRENCY", "USD")
        query_params["language"] = "en-US"
        query_params["location"] = "US"

        # --- maxStops filter ---
        # Support common client aliases: maxStops / max_stops
        max_stops = params.get("maxStops")
        if max_stops is None:
            max_stops = params.get("max_stops")
        try:
            max_stops = int(max_stops) if max_stops is not None else None
        except (TypeError, ValueError):
            max_stops = None

        # --- allowedAirlines filter (comma-separated string or list) ---
        allowed_airlines = params.get("allowedAirlines")
        if allowed_airlines is None:
            allowed_airlines = params.get("allowed_airlines")
        if isinstance(allowed_airlines, str):
            allowed_airlines = [x.strip().upper() for x in allowed_airlines.split(",") if x.strip()]
        elif isinstance(allowed_airlines, list):
            allowed_airlines = [str(x).strip().upper() for x in allowed_airlines if str(x).strip()]
        else:
            allowed_airlines = None

        allowed_airlines_set = set(allowed_airlines) if allowed_airlines else None

        # Roundtrip endpoint selection and arrivalDate
        if params.get("returnDate"):
            endpoint = "/google/flights/search-roundtrip"
            query_params["arrivalDate"] = params["returnDate"]
        else:
            endpoint = "/google/flights/search-one-way"

        list_url = "https://flights-sky.p.rapidapi.com" + endpoint

        google_payload = _request_json(list_url, query=query_params, headers=headers)
        root = _pick_root_obj(google_payload)
        if root.get("status") is False:
            logger.warning(
                "Sky-Scraper google/flights status=false",
                extra={"api_message": root.get("message"), "api_errors": root.get("errors")},
            )
            logger.warning("Sky-Scraper google/flights payload: %s", root)
            raise ProviderError(
                "Sky-Scraper returned an error.",
                status_code=502,
                details={"message": root.get("message"), "errors": root.get("errors")},
            )

        # 3) Parse raw offers from provider response (Google Flights)
        # We'll use _iter_google_flights to get the list of raw offers
        flights_data = root.get("data") if isinstance(root.get("data"), dict) else {}
        raw_offers = _iter_google_flights(flights_data)

        offers: list[dict] = []
        default_currency = query_params.get("currency") or getattr(settings, "DEFAULT_CURRENCY", "USD")

        for idx, raw_offer in enumerate(raw_offers):
            # Extract price
            price_total = _parse_price(
                raw_offer.get("price")
                or (raw_offer.get("pricing", {}) if isinstance(raw_offer.get("pricing"), dict) else {}).get("price")
                or (raw_offer.get("price", {}) if isinstance(raw_offer.get("price"), dict) else {}).get("amount")
                or (raw_offer.get("price", {}) if isinstance(raw_offer.get("price"), dict) else {}).get("formatted")
            )

            # Extract segments
            segments_raw = raw_offer.get("segments")
            if not isinstance(segments_raw, list):
                segments_raw = []
            segments = []
            seg_airlines: dict[str, str] = {}
            for s in segments_raw:
                if not isinstance(s, dict):
                    continue
                from_code = (
                    s.get("departureAirportCode")
                    or s.get("from")
                    or s.get("origin")
                    or query_params.get("origin")
                )
                to_code = (
                    s.get("arrivalAirportCode")
                    or s.get("to")
                    or s.get("destination")
                    or query_params.get("destination")
                )
                airline_obj = s.get("airline")
                airline_code = s.get("airlineCode")
                airline_name = None
                flight_number = s.get("flightNumber")
                if isinstance(airline_obj, dict):
                    airline_code = airline_code or airline_obj.get("airlineCode")
                    airline_name = airline_obj.get("airlineName")
                    flight_number = flight_number or airline_obj.get("flightNumber")
                elif isinstance(airline_obj, str):
                    airline_code = airline_code or airline_obj
                if airline_code:
                    seg_airlines[str(airline_code)] = airline_name or airline_code
                seg_dur = s.get("durationMinutes")
                seg_dur = int(seg_dur) if isinstance(seg_dur, (int, float)) else 0
                segments.append({
                    "from": from_code,
                    "to": to_code,
                    "departAt": _iso_dt(s.get("departureDate"), s.get("departureTime")),
                    "arriveAt": _iso_dt(s.get("arrivalDate"), s.get("arrivalTime")),
                    "airline": airline_code,
                    "flightNumber": flight_number,
                    "durationMinutes": seg_dur,
                })
            # Fallback for legs->segments if segments empty
            if not segments:
                legs = raw_offer.get("legs")
                if isinstance(legs, list):
                    for leg in legs:
                        if not isinstance(leg, dict):
                            continue
                        for s in leg.get("segments", []) if isinstance(leg.get("segments"), list) else []:
                            if not isinstance(s, dict):
                                continue
                            from_code = (
                                s.get("departureAirportCode")
                                or s.get("from")
                                or s.get("origin")
                                or query_params.get("origin")
                            )
                            to_code = (
                                s.get("arrivalAirportCode")
                                or s.get("to")
                                or s.get("destination")
                                or query_params.get("destination")
                            )
                            airline_obj = s.get("airline")
                            airline_code = s.get("airlineCode")
                            airline_name = None
                            flight_number = s.get("flightNumber")
                            if isinstance(airline_obj, dict):
                                airline_code = airline_code or airline_obj.get("airlineCode")
                                airline_name = airline_obj.get("airlineName")
                                flight_number = flight_number or airline_obj.get("flightNumber")
                            elif isinstance(airline_obj, str):
                                airline_code = airline_code or airline_obj
                            if airline_code:
                                seg_airlines[str(airline_code)] = airline_name or airline_code
                            seg_dur = s.get("durationMinutes")
                            seg_dur = int(seg_dur) if isinstance(seg_dur, (int, float)) else 0
                            segments.append({
                                "from": from_code,
                                "to": to_code,
                                "departAt": _iso_dt(s.get("departureDate"), s.get("departureTime")),
                                "arriveAt": _iso_dt(s.get("arrivalDate"), s.get("arrivalTime")),
                                "airline": airline_code,
                                "flightNumber": flight_number,
                                "durationMinutes": seg_dur,
                            })
            # 4) Compute normalized fields
            # Defensive: if vendor response doesn't include segments, skip the offer when filtering is requested,
            # otherwise we can incorrectly compute stops.
            if not segments and (max_stops is not None or allowed_airlines_set is not None):
                continue

            duration_minutes = _compute_duration_minutes(segments)
            stops = max(len(segments) - 1, 0)

            # --- ENFORCE maxStops ---
            # Note: stops is derived from number of segments (connections). maxStops=0 => exactly one segment.
            if max_stops is not None and stops > max_stops:
                continue
            # --- ENFORCE allowedAirlines ---
            if allowed_airlines_set is not None:
                # Keep offer only if ALL segment airline codes are allowed.
                seg_codes = [c for c in seg_airlines.keys() if c]
                if not seg_codes or not all(c in allowed_airlines_set for c in seg_codes):
                    continue

            airlines = [{"code": code, "name": name} for code, name in sorted(seg_airlines.items())]
            depart_at = segments[0]["departAt"] if segments else None
            arrive_at = segments[-1]["arriveAt"] if segments else None

            # 3) Offer ID logic
            vendor_id = raw_offer.get("id") or raw_offer.get("flightId") or raw_offer.get("detailToken") or f"idx_{idx}"
            offer_id = _short_offer_id(str(vendor_id))

            offers.append({
                "id": offer_id,
                "price": {"total": price_total, "currency": default_currency},
                "stops": stops,
                "durationMinutes": duration_minutes,
                "airlines": airlines,
                "segments": segments,
                "departAt": depart_at,
                "arriveAt": arrive_at,
            })

        # 5) Deduplicate and sort offers
        offers = _dedupe_offers(offers)
        offers = _sort_offers(offers, (params.get("sort") or "cheapest"))

        # 7) Limit results
        raw_limit = params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 50
        except (TypeError, ValueError):
            limit = 50

        limit = max(1, min(limit, 100))  # optional clamp
        # Build curve before slicing so the graph doesn't collapse when limit is small.
        offers_for_curve = offers
        offers = offers[:limit]

        # --- Recompute meta from FINAL returned offers (post-dedupe/sort/limit) ---
        final_prices = [
            o.get("price", {}).get("total")
            for o in offers
            if isinstance(o.get("price", {}).get("total"), (int, float))
        ]
        min_price = min(final_prices) if final_prices else None
        max_price = max(final_prices) if final_prices else None

        stops_counts = {"0": 0, "1": 0, "2+": 0}
        airlines_set: set[tuple[str, str]] = set()
        for o in offers:
            s = o.get("stops")
            if isinstance(s, (int, float)):
                s = int(s)
                if s <= 0:
                    stops_counts["0"] += 1
                elif s == 1:
                    stops_counts["1"] += 1
                else:
                    stops_counts["2+"] += 1
            for a in o.get("airlines") or []:
                code = a.get("code") if isinstance(a, dict) else None
                name = a.get("name") if isinstance(a, dict) else None
                if code:
                    airlines_set.add((str(code), str(name or code)))

        # 8) Build meta and query structure
        query = {
            "origin": params.get("origin"),
            "destination": params.get("destination"),
            "departDate": params.get("departDate"),
            "returnDate": params.get("returnDate"),
            "adults": params.get("adults"),
            "cabin": params.get("cabin"),
            "currency": params.get("currency") or getattr(settings, "DEFAULT_CURRENCY", "USD"),
        }
        meta = {
            "minPrice": min_price,
            "maxPrice": max_price,
            "airlines": [{"code": code, "name": name} for code, name in sorted(airlines_set)],
            "stopsCounts": stops_counts,
            "priceHistory": [],
        }
        price_history_source = "none"
        price_history_filter_aware = False
        price_history_cache_age = None
        price_history_cache_ttl = None

        # --- Price graph precedence (Option C) ---
        # Primary: Google price-graph (multi-day series) for a real timeline.
        # Secondary: offer-derived curve (responsive to filters) when it is robust enough.
        # Fallback: search-everywhere quote history.

        departure_airport = _to_google_airport(params.get("origin"))
        arrival_airport = _to_google_airport(params.get("destination"))

        curve_key = _google_curve_cache_key(
            {
                "departureId": departure_airport,
                "arrivalId": arrival_airport,
                "departDate": params.get("departDate"),
                "returnDate": params.get("returnDate"),
                "currency": params.get("currency"),
            }
        )
        cached_curve = cache.get(curve_key)

        # 1) Try Google price-graph (cached)
        if isinstance(cached_curve, dict) and isinstance(cached_curve.get("data"), list):
            cached_series = cached_curve.get("data")
            if cached_series:
                meta["priceHistory"] = cached_series
                price_history_source = "google_price_graph"
                price_history_filter_aware = False
                cached_at = cached_curve.get("cached_at")
                price_history_cache_age = int(now_ts - cached_at) if cached_at else None
                price_history_cache_ttl = GRAPH_CACHE_TTL
        elif isinstance(cached_curve, list) and cached_curve:
            meta["priceHistory"] = cached_curve
            price_history_source = "google_price_graph"
            price_history_filter_aware = False
            price_history_cache_ttl = GRAPH_CACHE_TTL
        else:
            try:
                graph_query = {
                    "departureId": departure_airport,
                    "arrivalId": arrival_airport,
                    "departureDate": params.get("departDate"),
                }
                if params.get("currency"):
                    graph_query["currency"] = params.get("currency")

                if params.get("returnDate"):
                    graph_query["arrivalDate"] = params.get("returnDate")
                    graph_url = GOOGLE_PRICE_GRAPH_ROUNDTRIP_URL
                else:
                    graph_url = GOOGLE_PRICE_GRAPH_ONE_WAY_URL

                graph_payload = _request_json(graph_url, query=graph_query, headers=headers)
                graph_series = _normalize_price_history_from_google_price_graph(graph_payload)

                if graph_series:
                    meta["priceHistory"] = graph_series
                    price_history_source = "google_price_graph"
                    price_history_filter_aware = False
                    cache.set(
                        curve_key,
                        {"data": graph_series, "cached_at": now_ts},
                        timeout=GRAPH_CACHE_TTL,
                    )
            except ProviderError:
                # Don't fail the whole request if graph fails
                pass

        # 2) Offer-derived curve (only if it provides a meaningful series)
        offers_curve = _build_offer_curve(offers_for_curve)
        if _should_override_curve(offers_curve, meta.get("priceHistory") or []):
            # Prefer offer-derived when it has real variance (feels "live" with filters)
            meta["priceHistory"] = offers_curve
            price_history_source = "offers"
            price_history_filter_aware = True
            price_history_cache_age = None
            price_history_cache_ttl = None

        # 3) Fallback to search-everywhere if we still have no curve
        if not meta["priceHistory"]:
            try:
                from_entity = _to_everywhere_entity(params.get("origin"))
                to_entity = _to_everywhere_entity(params.get("destination"))

                everywhere_query = {
                    "fromEntityId": from_entity,
                    "toEntityId": to_entity,
                    "type": "roundtrip" if params.get("returnDate") else "oneway",
                }
                if params.get("currency"):
                    everywhere_query["currency"] = params["currency"]

                if not everywhere_query["fromEntityId"] or not everywhere_query["toEntityId"]:
                    raise ProviderError("Missing entity ids for search-everywhere.")

                everywhere_payload = _request_json(
                    SKYSCRAPER_EVERYWHERE_URL,
                    query=everywhere_query,
                    headers=headers,
                )

                price_history = _normalize_price_history_from_everywhere(
                    everywhere_payload,
                    params,
                )
                meta["priceHistory"] = price_history
                price_history_source = "search_everywhere"
                price_history_filter_aware = False
            except ProviderError:
                pass

        if not meta["priceHistory"]:
            price_history_source = "none"
            price_history_filter_aware = False
        meta["priceHistorySource"] = price_history_source
        meta["priceHistoryFilterAware"] = price_history_filter_aware
        meta["priceHistoryPoints"] = len(meta.get("priceHistory") or [])
        meta["cached"] = False
        meta["cacheAgeSeconds"] = price_history_cache_age
        meta["cacheTtlSeconds"] = price_history_cache_ttl

        result = {
            "query": query,
            "offers": offers,
            "meta": meta,
        }
        # Ensure stable ordering for charting
        if isinstance(result.get("meta", {}).get("priceHistory"), list):
            try:
                result["meta"]["priceHistory"] = sorted(
                    result["meta"]["priceHistory"],
                    key=lambda x: x.get("date") if isinstance(x, dict) else "",
                )
            except Exception:
                pass
        # Cache for a short time to smooth repeated UI queries.
        if not bypass_cache:
            cache.set(
                ck,
                {"payload": result, "cached_at": now_ts},
                timeout=RESPONSE_CACHE_TTL,
            )
        return result
