# KINATWA SACCO Backend Management System

Flask + SQLite administrative system for managing a 16-seater SACCO transport operation.

## Overview

This project is a backend-oriented admin panel (not a public booking site) with:

- Sidebar navigation across all management modules.
- Flask routes + Jinja2 templates for each module page.
- SQLite persistence for trips, customers, bookings, payments, and settings.
- Booking seat controls for a 16-seat minibus layout.

## Modules

- Dashboard
- Trips / Routes
- Vehicles
- Drivers
- Schedules
- Bookings
- Parcels
- Customers
- Payments
- Reports
- Settings

## Booking Rules Implemented

- Seats are limited to **1–16**.
- A seat cannot be double-booked on the same trip (`UNIQUE(trip_id, seat_number)`).
- Bookings are accepted only for trips with status `open`.
- Payment status is validated (`pending` or `paid`) before saving.

## Tech Stack

- **Backend:** Python + Flask
- **Database:** SQLite (`kinatwa.db`)
- **Templating:** Jinja2
- **Styling:** Plain CSS (`static/styles.css`)

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install flask
python app.py
```

Open in browser: `http://127.0.0.1:5000`

## Project Structure

```text
app.py
templates/
static/
README.md
```

## Notes

- The database schema is initialized automatically on app startup.
- Seed trips are added on first run when the trips table is empty.
- `SECRET_KEY` is currently development-only and should be replaced for production deployments.
