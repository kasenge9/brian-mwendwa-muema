# KINATWA SACCO Backend Management System

A Flask + SQLite backend-oriented transport management system for a 16-seater minibus SACCO.

## Features

- Sidebar admin layout with module navigation and active-page highlighting.
- Flask-rendered pages (Jinja2) for:
  - Dashboard
  - Trips / Routes
  - Vehicles
  - Drivers
  - Schedules
  - Bookings (with 16-seat selection)
  - Parcels
  - Customers
  - Payments
  - Reports
  - Settings
- SQLite persistence.
- Flash messages for success/failure actions.
- Booking form with seat conflict prevention (`UNIQUE(trip_id, seat_number)`).

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install flask
python app.py
```

Open: `http://127.0.0.1:5000`

## Notes

- Database file is created automatically as `kinatwa.db`.
- Initial seed trips are inserted on first run.
- This is a backend/admin foundation and can be extended with full CRUD, auth, Daraja API integration, and PDF exports.
