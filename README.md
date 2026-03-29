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
- SQLite persistence with basic relational integrity.
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

## Merge conflict quick-fix (`README.md`)

If GitHub reports **"This branch has conflicts that must be resolved"** for `README.md`, use:

```bash
git fetch origin
git checkout work
git merge origin/main
# edit README.md and resolve <<<<<<< ======= >>>>>>> markers
git add README.md
git commit -m "Resolve README merge conflict"
git push origin work
```

If you are **not planning to merge**, abort safely:

```bash
git merge --abort
```

## Notes

- Database file is created automatically as `kinatwa.db`.
- Initial seed trips are inserted on first run.
- This is a backend/admin foundation and can be extended with full CRUD, auth, Daraja API integration, and PDF exports.
