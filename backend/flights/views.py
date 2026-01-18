from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from flights.providers import get_flight_provider
from flights.providers.base import ProviderError
from flights.serializers import FlightSearchSerializer


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})


class FlightSearchView(APIView):
    def post(self, request):
        serializer = FlightSearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        params = serializer.validated_data

        # --- Optional controls (may not be present in serializer) ---
        # Keep these optional so the endpoint remains backward-compatible.
        raw = request.data if isinstance(request.data, dict) else {}

        def _to_int(v):
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        def _to_str_list(v):
            # Accept: ["KQ","EY"] or "KQ,EY" or "KQ".
            if v is None:
                return None
            if isinstance(v, list):
                return [str(x).strip().upper() for x in v if str(x).strip()]
            if isinstance(v, str):
                parts = [p.strip().upper() for p in v.split(",")]
                return [p for p in parts if p]
            return None

        # Prefer serializer-validated currency if your serializer supports it; otherwise fall back.
        currency = params.get("currency") if isinstance(params, dict) else None
        if currency is None:
            currency = raw.get("currency")
        currency = currency or None

        normalized_params = {
            **params,
            "departDate": params["departDate"].isoformat(),
            "returnDate": params["returnDate"].isoformat() if params.get("returnDate") else None,
            # Optional controls
            "sort": raw.get("sort"),
            "limit": _to_int(raw.get("limit")),
            "maxStops": _to_int(raw.get("maxStops")),
            "allowedAirlines": _to_str_list(raw.get("allowedAirlines")),
        }

        def _ck(v):
            # Preserve 0/False-y values; only None becomes empty.
            return "" if v is None else str(v)

        cache_key = (
            "flights:search:"
            f"{_ck(normalized_params.get('origin'))}:"
            f"{_ck(normalized_params.get('destination'))}:"
            f"{_ck(normalized_params.get('departDate'))}:"
            f"{_ck(normalized_params.get('returnDate'))}:"
            f"{_ck(normalized_params.get('adults'))}:"
            f"{_ck(normalized_params.get('cabin'))}:"
            f"{_ck(currency)}:"
            f"{_ck(normalized_params.get('sort'))}:"
            f"{_ck(normalized_params.get('limit'))}:"
            f"{_ck(normalized_params.get('maxStops'))}:"
            f"{','.join(normalized_params.get('allowedAirlines') or [])}"
        )

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        provider = get_flight_provider()

        try:
            # Forward optional controls through to the provider.
            provider_params = dict(normalized_params)
            if currency:
                provider_params["currency"] = currency
            result = provider.search_flights(provider_params)
        except ProviderError as exc:
            payload = {"message": str(exc)}
            return Response(payload, status=exc.status_code or status.HTTP_502_BAD_GATEWAY)

        # Cache normalized results for 10 minutes
        cache.set(cache_key, result, 600)
        return Response(result)
