class ProviderError(Exception):
    def __init__(self, message, status_code=502, details=None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}


class FlightProvider:
    def search_flights(self, params):
        """
        Returns normalized flight offers.
        """
        raise NotImplementedError
