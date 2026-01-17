from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import Client, TestCase, override_settings


class PlacesAutocompleteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()

    def test_short_query_returns_empty(self):
        response = self.client.get("/api/places/autocomplete", {"q": "n"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"], [])

    @override_settings(AIRPORTS_DATA_URL="http://example.test/airports.json")
    @patch("flights.views_places.requests.get")
    def test_cache_returns_same_data(self, mock_get):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "HKJK": {
                "icao": "HKJK",
                "iata": "NBO",
                "name": "Jomo Kenyatta International Airport",
                "city": "Nairobi",
                "country": "KE",
            }
        }
        mock_get.return_value = mock_response

        response1 = self.client.get("/api/places/autocomplete", {"q": "nai"})
        response2 = self.client.get("/api/places/autocomplete", {"q": "nai"})

        self.assertEqual(response1.status_code, 200)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response1.json(), response2.json())
        mock_get.assert_called_once()

    @override_settings(AIRPORTS_DATA_URL="http://example.test/airports.json")
    @patch("flights.views_places.requests.get")
    def test_provider_error_returns_502(self, mock_get):
        mock_get.side_effect = OSError("Boom")
        response = self.client.get("/api/places/autocomplete", {"q": "nai"})
        self.assertEqual(response.status_code, 502)
