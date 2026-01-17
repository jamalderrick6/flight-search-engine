from __future__ import annotations

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET

DATASET_CACHE_KEY = "places:airports:dataset"


def _normalize_result(item: dict) -> dict | None:
    code = item.get("iata") or item.get("iataCode") or item.get("icao") or item.get("icaoCode")
    city = item.get("city")
    country = item.get("country")
    airport_name = item.get("name") or item.get("airportName")

    if not code and not city and not airport_name:
        return None

    label_parts = [part for part in (city, airport_name, country) if part]
    label = " — ".join(label_parts)
    if code:
        label = f"{label} ({code})" if label else code

    return {
        "code": code,
        "label": label,
        "city": city,
        "country": country,
        "airportName": airport_name,
    }


def _load_airports_dataset():
    cached = cache.get(DATASET_CACHE_KEY)
    if isinstance(cached, list):
        return cached

    response = requests.get(settings.AIRPORTS_DATA_URL, timeout=15)
    response.raise_for_status()
    payload = response.json()

    airports = []
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, dict):
                airports.append(value)
    elif isinstance(payload, list):
        airports = [item for item in payload if isinstance(item, dict)]

    cache.set(DATASET_CACHE_KEY, airports, 60 * 60 * 24)
    return airports


@require_GET
def places_autocomplete(request):
    query = (request.GET.get("q") or "").strip()
    if len(query) < 2:
        return JsonResponse({"query": query, "results": []})

    raw_limit = request.GET.get("limit")
    try:
        limit = int(raw_limit) if raw_limit is not None else 8
    except (TypeError, ValueError):
        limit = 8
    limit = max(1, min(limit, 12))

    cache_key = f"places:airports:{query.lower()}:{limit}"
    cached = cache.get(cache_key)
    if cached is not None:
        return JsonResponse({"query": query, "results": cached})

    try:
        dataset = _load_airports_dataset()
    except (requests.RequestException, ValueError):
        return JsonResponse(
            {"query": query, "results": [], "error": "Autocomplete dataset error."},
            status=502,
        )

    query_lower = query.lower()
    results = []
    for item in dataset:
        iata = (item.get("iata") or "").lower()
        icao = (item.get("icao") or "").lower()
        city = (item.get("city") or "").lower()
        name = (item.get("name") or "").lower()
        country = (item.get("country") or "").lower()
        if (
            query_lower in iata
            or query_lower in icao
            or query_lower in city
            or query_lower in name
            or query_lower in country
        ):
            normalized = _normalize_result(item)
            if normalized:
                results.append(normalized)
            if len(results) >= limit:
                break

    cache.set(cache_key, results, 60 * 60)
    return JsonResponse({"query": query, "results": results})
