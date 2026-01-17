import re
from django.conf import settings

DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?")


def parse_duration_to_minutes(value):
    if not value:
        return 0
    match = DURATION_RE.match(value)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes


def _flatten_segments(itineraries):
    segments = []
    for itinerary in itineraries:
        segments.extend(itinerary.get("segments", []))
    return segments


def _collect_airlines(segments):
    codes = []
    seen = set()
    for segment in segments:
        code = segment.get("carrierCode")
        if code and code not in seen:
            seen.add(code)
            codes.append({"code": code, "name": code})
    return codes


def normalize_flight_offers(raw, query_params):
    offers = raw.get("data", []) if isinstance(raw, dict) else []
    normalized_offers = []
    price_values = []
    airlines_meta = {}
    stops_counts = {"0": 0, "1": 0, "2+": 0}

    for offer in offers:
        itineraries = offer.get("itineraries", [])
        segments = _flatten_segments(itineraries)
        if not segments:
            continue

        price = float(offer.get("price", {}).get("total", 0) or 0)
        currency = offer.get("price", {}).get("currency") or settings.DEFAULT_CURRENCY
        price_values.append(price)

        itinerary_stops = [max(len(itinerary.get("segments", [])) - 1, 0) for itinerary in itineraries]
        # For round trips, we use the max stops/duration across itineraries and flatten all segments.
        stops = max(itinerary_stops) if itinerary_stops else 0
        durations = [parse_duration_to_minutes(itinerary.get("duration")) for itinerary in itineraries]
        duration_minutes = max(durations) if durations else 0

        airlines = _collect_airlines(segments)
        for airline in airlines:
            airlines_meta[airline["code"]] = airline

        if stops == 0:
            stops_counts["0"] += 1
        elif stops == 1:
            stops_counts["1"] += 1
        else:
            stops_counts["2+"] += 1

        offer_segments = []
        for segment in segments:
            offer_segments.append(
                {
                    "from": segment.get("departure", {}).get("iataCode"),
                    "to": segment.get("arrival", {}).get("iataCode"),
                    "departAt": segment.get("departure", {}).get("at"),
                    "arriveAt": segment.get("arrival", {}).get("at"),
                    "airline": segment.get("carrierCode"),
                    "flightNumber": segment.get("number"),
                    "durationMinutes": parse_duration_to_minutes(segment.get("duration")),
                }
            )

        normalized_offers.append(
            {
                "id": f"off_{offer.get('id')}",
                "price": {"total": price, "currency": currency},
                "stops": stops,
                "durationMinutes": duration_minutes,
                "airlines": airlines,
                "segments": offer_segments,
                "departAt": offer_segments[0].get("departAt"),
                "arriveAt": offer_segments[-1].get("arriveAt"),
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
            "airlines": list(airlines_meta.values()),
            "stopsCounts": stops_counts,
        },
    }
