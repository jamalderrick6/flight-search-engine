# Flight Search Engine

A full‑stack flight search engine built with a **Django + DRF backend** and a **Vite + React frontend**, developed as part of a frontend engineering assessment.

The project focuses on **product sense, data modeling, and reliability** when working with complex, rate‑limited third‑party APIs.

---

## ✨ Key Goals

- Clear, intuitive UX for complex flight data
- Real‑time filtering with immediate visual feedback
- Thoughtful handling of incomplete or rate‑limited data
- Production‑style architecture under realistic constraints

While inspired by Google Flights, the interface and system design are intentionally **not a visual clone**.

---

## 🧱 Architecture Overview

```
backend/   → Django REST API (search, filters, price history, autocomplete)
frontend/  → React UI (search form, results, filters, price graph)
```

---

## 🔌 Data Sources & API Strategy

Flight data is powered by third‑party APIs (via **RapidAPI**) using a **test / demo plan**.

Because API quotas are intentionally limited, the backend is designed to behave like a production system operating under cost and reliability constraints:

- Aggressive caching to minimize duplicate requests
- Separation of offer data vs. price‑history data
- Graceful fallback behavior when certain datasets are unavailable

This mirrors real‑world scenarios where external flight APIs are expensive or rate‑limited.

---

## 📈 Price History & Graph Logic

The price graph follows a **layered strategy** to balance accuracy, responsiveness, and resilience:

### 1. Offer‑derived price curve (preferred)
- Computed directly from the currently returned flight offers
- Reflects active filters (stops, airlines, sorting)
- Used when **2+ data points** are available

### 2. Cached Google price‑graph curve
- Retrieved via a dedicated price‑graph endpoint
- Cached per `(origin, destination, date, currency)` for 15 minutes
- Not filter‑aware, but provides broader historical context

### 3. Fallback behavior
- If insufficient data exists, the UI avoids misleading claims
- Messaging adapts based on the number of available points

This allows the UI to feel **live and responsive** while remaining technically honest.

---

## ⚡ Caching & Performance

To reduce unnecessary external calls and improve perceived performance:

- Search results are cached for short TTLs
- Price‑history curves are cached independently
- Identical searches reuse cached responses
- Filters operate on already‑fetched data when possible

In a production environment, this layer would sit in front of higher‑quota providers or internal aggregation services.

---

## 🚫 Known Limitations (Intentional)

This project is scoped as an assessment and demo:

- API quotas are limited by design
- Prices and availability are **not guaranteed real‑time**
- Data freshness is bounded by cache TTLs

These tradeoffs are **explicit and documented** to reflect realistic engineering constraints rather than over‑engineering.

---

## 🚀 Quick Start

### Backend
```
cd backend
python manage.py migrate
python manage.py runserver
```

### Frontend
```
cd frontend
npm install
npm run dev
```

---

## 🔐 Environment Variables

Backend (`backend/.env`):
```
DEFAULT_CURRENCY=USD
FLIGHTS_PROVIDER=skyscraper
SKY_SCRAPER_API_KEY=your_rapidapi_key
AIRPORTS_DATA_URL=https://raw.githubusercontent.com/mwgg/Airports/refs/heads/master/airports.json
```

Frontend:
```
VITE_API_BASE=http://localhost:8000
```

---

## 🌍 Deployment

- **Frontend:** Vercel
- **Backend:** Django API (Render-compatible)

Environment variables are used for all secrets.  
No API keys are committed to the repository.

See `backend/README.md` and `frontend/README.md` for details.

---

## 🧠 Final Notes

The goal of this project is not just to fetch flight data, but to demonstrate:
- Sound engineering judgment
- Strong product thinking
- Reliability under imperfect conditions

These are the same tradeoffs encountered in real‑world travel and marketplace systems.