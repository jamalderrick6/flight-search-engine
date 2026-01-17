from django.conf import settings

from flights.providers.base import ProviderError
from flights.providers.skyscraper import SkyScraperProvider


def get_flight_provider():
    """Return the configured flight provider instance."""

    raw_name = getattr(settings, "FLIGHTS_PROVIDER", None) or "skyscraper"
    provider_name = str(raw_name).strip().lower()

    aliases = {
        "skyscraper": "skyscraper",
        "sky-scrapper": "skyscraper",
        "flights-sky": "skyscraper",
    }

    provider_name = aliases.get(provider_name, provider_name)

    if provider_name == "skyscraper":
        return SkyScraperProvider()

    if provider_name == "amadeus":
        raise ProviderError("Amadeus provider is not configured.", status_code=501)

    raise ProviderError(f"Unknown flights provider: {provider_name}", status_code=500)
