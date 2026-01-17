from django.urls import path

from flights.views import FlightSearchView, HealthView
from flights.views_places import places_autocomplete

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("flights/search", FlightSearchView.as_view(), name="flight-search"),
    path("places/autocomplete", places_autocomplete, name="places-autocomplete"),
]
