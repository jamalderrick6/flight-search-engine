# Backend (Django + DRF)

## Environment
Create `backend/.env` with:

```
DEFAULT_CURRENCY=USD
FLIGHTS_PROVIDER=skyscraper
SKY_SCRAPER_API_KEY=your_rapidapi_key
```

## Running
```
cd backend
python manage.py migrate
python manage.py runserver
```

## Endpoints
- `GET /api/health`
- `POST /api/flights/search`

### Example: Health
```
curl http://localhost:8000/api/health
```

### Example: Flight search
```
curl -X POST http://localhost:8000/api/flights/search \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "NYCA",
    "destination": "NBO",
    "departDate": "2025-02-01",
    "returnDate": null,
    "adults": 1,
    "cabin": "ECONOMY"
  }'
```

## Notes
- `origin`/`destination` accept 3-8 characters to support city/entity IDs (e.g., `NYCA`) or IATA airport codes.
- The provider is selected via `FLIGHTS_PROVIDER`; current option is `skyscraper`.
