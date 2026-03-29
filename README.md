# Kinatawa 16-Seater Minibus Booking Website

A Tahmeed-inspired demo booking website for a **16-seater Kinatawa minibus** built with vanilla HTML, CSS, and JavaScript.

## Advanced features included

- Trip search by route, date, and passenger count (1–4 passengers).
- Interactive **16-seat aisle layout** with four real-time states:
  - Available
  - Selected
  - Booked
  - Temporarily held (5 minutes)
- Multi-seat booking in one checkout transaction.
- Dynamic fare engine:
  - Weekend surcharge (+15%)
  - Peak-hour surcharge (+10%)
- Checkout flow with simulated M-Pesa STK push confirmation.
- Ticket generation with:
  - Booking ID
  - Seat list
  - Driver contact
  - Print and text-download options
- Live trip tracker (demo progress bar status).
- Driver WhatsApp quick-contact button from trip cards.
- Admin dashboard with KPIs:
  - Total trips
  - Bookings
  - Seats sold
  - Revenue
- Admin trip management:
  - Add trip
  - Cancel/reopen trip
  - Occupancy visibility

> Note: This is a front-end MVP+ demo. Payments, WhatsApp, and tracking are simulated/browser-based.

## Project files

- `index.html` — App structure (search, seat map, checkout, ticket, tracker, admin).
- `styles.css` — Responsive UI, seat map visuals, progress tracker, admin KPIs.
- `script.js` — Business logic for searching, seat holds, pricing, checkout, ticketing, tracking, and admin actions.

## Run locally

1. Clone the repository.
2. Open `index.html` in a modern browser.

No build step is required.

## Recommended next production steps

- Move data from localStorage to backend APIs.
- Add proper authentication and admin authorization.
- Use PostgreSQL/MySQL for trips/seats/bookings/payments.
- Integrate real M-Pesa Daraja callbacks.
- Implement server-side transactional seat locking.
- Add PDF ticketing and SMS/WhatsApp notification services.
