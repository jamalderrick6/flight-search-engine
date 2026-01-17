# Flight Search Engine

Full-stack flight search engine with a Django + DRF backend and a Vite + React frontend.

## Structure
- `backend/` Django API (flight search + places autocomplete)
- `frontend/` React UI (search, filters, results, price graph)

## Quick Start
Backend:
```
cd backend
python manage.py migrate
python manage.py runserver
```

Frontend:
```
cd frontend
npm install
npm run dev
```

## Environment
Backend env vars live in `backend/.env`:
```
DEFAULT_CURRENCY=USD
FLIGHTS_PROVIDER=skyscraper
SKY_SCRAPER_API_KEY=your_rapidapi_key
AIRPORTS_DATA_URL=https://raw.githubusercontent.com/mwgg/Airports/refs/heads/master/airports.json
```

Frontend (optional):
```
VITE_API_BASE=http://localhost:8000
```

See `backend/README.md` and `frontend/README.md` for details.
