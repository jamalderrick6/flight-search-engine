from django.urls import path

from flights.views import FlightSearchView, HealthView

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("flights/search", FlightSearchView.as_view(), name="flight-search"),
]
