from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, flash, g, redirect, render_template, request, url_for

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "kinatwa.db"
SEAT_CAPACITY = 16

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-change-this"


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_: Any) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_from TEXT NOT NULL,
            route_to TEXT NOT NULL,
            travel_date TEXT NOT NULL,
            departure_time TEXT NOT NULL,
            price REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'open'
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate_number TEXT NOT NULL,
            model TEXT NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 16,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            license_no TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            vehicle_id INTEGER,
            driver_id INTEGER,
            departure_time TEXT NOT NULL,
            FOREIGN KEY(trip_id) REFERENCES trips(id),
            FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
            FOREIGN KEY(driver_id) REFERENCES drivers(id)
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            trip_id INTEGER NOT NULL,
            seat_number INTEGER NOT NULL,
            payment_status TEXT NOT NULL DEFAULT 'pending',
            booked_at TEXT NOT NULL,
            UNIQUE(trip_id, seat_number),
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        );

        CREATE TABLE IF NOT EXISTS parcels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            trip_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'in_transit',
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT NOT NULL DEFAULT 'M-Pesa',
            status TEXT NOT NULL DEFAULT 'pending',
            paid_at TEXT,
            FOREIGN KEY(booking_id) REFERENCES bookings(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            sacco_name TEXT NOT NULL DEFAULT 'Kinatwa SACCO',
            contact_phone TEXT NOT NULL DEFAULT '+254700000000',
            logo_url TEXT,
            fare_rules TEXT NOT NULL DEFAULT 'Base fare by trip route',
            mpesa_enabled INTEGER NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO settings (id) VALUES (1);
        """
    )

    trip_count = db.execute("SELECT COUNT(*) AS c FROM trips").fetchone()["c"]
    if trip_count == 0:
        db.executemany(
            """
            INSERT INTO trips (route_from, route_to, travel_date, departure_time, price)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                ("Mombasa", "Nairobi", "2026-04-02", "07:00", 1800),
                ("Nairobi", "Mombasa", "2026-04-02", "15:00", 1800),
            ],
        )

    db.commit()


def fetch_sidebar_counts() -> dict[str, int]:
    db = get_db()
    return {
        "trips": db.execute("SELECT COUNT(*) c FROM trips").fetchone()["c"],
        "bookings": db.execute("SELECT COUNT(*) c FROM bookings").fetchone()["c"],
        "drivers": db.execute("SELECT COUNT(*) c FROM drivers").fetchone()["c"],
        "vehicles": db.execute("SELECT COUNT(*) c FROM vehicles").fetchone()["c"],
    }


def occupied_seats_map(trip_id: int) -> set[int]:
    rows = get_db().execute(
        "SELECT seat_number FROM bookings WHERE trip_id = ?", (trip_id,)
    ).fetchall()
    return {r["seat_number"] for r in rows}


def parse_positive_int(value: str, *, lower: int, upper: int | None = None) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None

    if parsed < lower:
        return None
    if upper is not None and parsed > upper:
        return None
    return parsed


@app.route("/")
def dashboard() -> str:
    db = get_db()
    today = datetime.utcnow().date().isoformat()
    totals = {
        "bookings_today": db.execute(
            "SELECT COUNT(*) c FROM bookings WHERE date(booked_at)=?", (today,)
        ).fetchone()["c"],
        "open_trips": db.execute("SELECT COUNT(*) c FROM trips WHERE status='open'").fetchone()[
            "c"
        ],
        "total_trips": db.execute("SELECT COUNT(*) c FROM trips").fetchone()["c"],
        "revenue": db.execute(
            """
            SELECT COALESCE(SUM(p.amount),0) amount
            FROM payments p
            WHERE p.status='paid'
            """
        ).fetchone()["amount"],
    }

    available = db.execute(
        """
        SELECT COALESCE(SUM(? - booked),0) free_seats
        FROM (
            SELECT t.id, COUNT(b.id) AS booked
            FROM trips t
            LEFT JOIN bookings b ON b.trip_id=t.id
            WHERE t.status='open'
            GROUP BY t.id
        )
        """,
        (SEAT_CAPACITY,),
    ).fetchone()["free_seats"]

    return render_template(
        "dashboard.html",
        active="dashboard",
        totals=totals,
        available_seats=available,
        counts=fetch_sidebar_counts(),
    )


@app.route("/trips", methods=["GET", "POST"])
def trips() -> str:
    db = get_db()
    if request.method == "POST":
        db.execute(
            """
            INSERT INTO trips (route_from, route_to, travel_date, departure_time, price, status)
            VALUES (?, ?, ?, ?, ?, 'open')
            """,
            (
                request.form["route_from"],
                request.form["route_to"],
                request.form["travel_date"],
                request.form["departure_time"],
                request.form["price"],
            ),
        )
        db.commit()
        flash("Trip added successfully.", "success")
        return redirect(url_for("trips"))

    if request.args.get("toggle"):
        trip_id = parse_positive_int(request.args["toggle"], lower=1)
        if trip_id is None:
            flash("Invalid trip id.", "error")
            return redirect(url_for("trips"))

        db.execute(
            """
            UPDATE trips
            SET status = CASE status WHEN 'open' THEN 'cancelled' ELSE 'open' END
            WHERE id = ?
            """,
            (trip_id,),
        )
        db.commit()
        flash("Trip status updated.", "success")
        return redirect(url_for("trips"))

    rows = db.execute(
        "SELECT * FROM trips ORDER BY travel_date ASC, departure_time ASC"
    ).fetchall()
    return render_template("trips.html", active="trips", trips=rows, counts=fetch_sidebar_counts())


@app.route("/bookings", methods=["GET", "POST"])
def bookings() -> str:
    db = get_db()
    if request.method == "POST":
        trip_id = parse_positive_int(request.form.get("trip_id", ""), lower=1)
        seat_number = parse_positive_int(
            request.form.get("seat_number", ""), lower=1, upper=SEAT_CAPACITY
        )
        if trip_id is None or seat_number is None:
            flash("Invalid trip or seat selected.", "error")
            return redirect(url_for("bookings"))

        trip = db.execute("SELECT id, price FROM trips WHERE id=? AND status='open'", (trip_id,)).fetchone()
        if trip is None:
            flash("Selected trip is unavailable.", "error")
            return redirect(url_for("bookings"))

        customer = db.execute(
            "SELECT id FROM customers WHERE phone = ?", (request.form["phone"],)
        ).fetchone()
        if customer is None:
            cur = db.execute(
                "INSERT INTO customers (full_name, phone, email) VALUES (?, ?, ?)",
                (request.form["full_name"], request.form["phone"], request.form.get("email") or None),
            )
            customer_id = cur.lastrowid
        else:
            customer_id = customer["id"]

        payment_status = request.form["payment_status"]
        if payment_status not in {"pending", "paid"}:
            flash("Invalid payment status selected.", "error")
            return redirect(url_for("bookings", trip_id=trip_id))

        try:
            cur = db.execute(
                """
                INSERT INTO bookings (customer_id, trip_id, seat_number, payment_status, booked_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    customer_id,
                    trip_id,
                    seat_number,
                    payment_status,
                    datetime.utcnow().isoformat(),
                ),
            )
            db.execute(
                "INSERT INTO payments (booking_id, amount, method, status, paid_at) VALUES (?, ?, ?, ?, ?)",
                (
                    cur.lastrowid,
                    trip["price"],
                    "M-Pesa",
                    "paid" if payment_status == "paid" else "pending",
                    datetime.utcnow().isoformat() if payment_status == "paid" else None,
                ),
            )
            db.commit()
            flash("Booking saved successfully.", "success")
        except sqlite3.IntegrityError:
            db.rollback()
            flash("Seat already booked for this trip.", "error")
        return redirect(url_for("bookings", trip_id=trip_id))

    selected_trip_id = parse_positive_int(request.args.get("trip_id", "1"), lower=1) or 1
    trip_rows = db.execute("SELECT * FROM trips WHERE status='open' ORDER BY travel_date").fetchall()
    if not trip_rows:
        return render_template(
            "bookings.html",
            active="bookings",
            trips=[],
            bookings=[],
            selected_trip_id=None,
            occupied_seats=set(),
            counts=fetch_sidebar_counts(),
        )

    valid_trip_ids = {r["id"] for r in trip_rows}
    if selected_trip_id not in valid_trip_ids:
        selected_trip_id = trip_rows[0]["id"]

    booking_rows = db.execute(
        """
        SELECT b.id, c.full_name, c.phone, b.seat_number, b.payment_status, b.booked_at,
               t.route_from, t.route_to, t.travel_date, t.departure_time
        FROM bookings b
        JOIN customers c ON c.id = b.customer_id
        JOIN trips t ON t.id = b.trip_id
        ORDER BY b.booked_at DESC
        """
    ).fetchall()

    return render_template(
        "bookings.html",
        active="bookings",
        trips=trip_rows,
        bookings=booking_rows,
        selected_trip_id=selected_trip_id,
        occupied_seats=occupied_seats_map(selected_trip_id),
        counts=fetch_sidebar_counts(),
    )


@app.route("/drivers", methods=["GET", "POST"])
def drivers() -> str:
    db = get_db()
    if request.method == "POST":
        db.execute(
            "INSERT INTO drivers (full_name, phone, license_no, status) VALUES (?, ?, ?, 'active')",
            (request.form["full_name"], request.form["phone"], request.form["license_no"]),
        )
        db.commit()
        flash("Driver added.", "success")
        return redirect(url_for("drivers"))

    rows = db.execute("SELECT * FROM drivers ORDER BY id DESC").fetchall()
    return render_template("drivers.html", active="drivers", drivers=rows, counts=fetch_sidebar_counts())


@app.route("/vehicles", methods=["GET", "POST"])
def vehicles() -> str:
    db = get_db()
    if request.method == "POST":
        db.execute(
            "INSERT INTO vehicles (plate_number, model, capacity, status) VALUES (?, ?, ?, 'active')",
            (request.form["plate_number"], request.form["model"], request.form["capacity"]),
        )
        db.commit()
        flash("Vehicle added.", "success")
        return redirect(url_for("vehicles"))

    rows = db.execute("SELECT * FROM vehicles ORDER BY id DESC").fetchall()
    return render_template("vehicles.html", active="vehicles", vehicles=rows, counts=fetch_sidebar_counts())


@app.route("/schedules")
def schedules() -> str:
    rows = get_db().execute(
        """
        SELECT s.id, t.route_from, t.route_to, t.travel_date, s.departure_time,
               v.plate_number, d.full_name
        FROM schedules s
        JOIN trips t ON t.id = s.trip_id
        LEFT JOIN vehicles v ON v.id = s.vehicle_id
        LEFT JOIN drivers d ON d.id = s.driver_id
        ORDER BY t.travel_date, s.departure_time
        """
    ).fetchall()
    return render_template("schedules.html", active="schedules", schedules=rows, counts=fetch_sidebar_counts())


@app.route("/parcels")
def parcels() -> str:
    rows = get_db().execute(
        """
        SELECT p.id, p.customer_name, p.phone, p.description, p.status,
               t.route_from, t.route_to, t.travel_date
        FROM parcels p
        JOIN trips t ON t.id = p.trip_id
        ORDER BY p.id DESC
        """
    ).fetchall()
    return render_template("parcels.html", active="parcels", parcels=rows, counts=fetch_sidebar_counts())


@app.route("/customers")
def customers() -> str:
    rows = get_db().execute("SELECT * FROM customers ORDER BY id DESC").fetchall()
    return render_template("customers.html", active="customers", customers=rows, counts=fetch_sidebar_counts())


@app.route("/payments")
def payments() -> str:
    rows = get_db().execute(
        """
        SELECT p.id, p.amount, p.method, p.status, p.paid_at,
               c.full_name, b.seat_number, t.route_from, t.route_to
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        JOIN customers c ON c.id = b.customer_id
        JOIN trips t ON t.id = b.trip_id
        ORDER BY p.id DESC
        """
    ).fetchall()
    return render_template("payments.html", active="payments", payments=rows, counts=fetch_sidebar_counts())


@app.route("/reports")
def reports() -> str:
    db = get_db()
    daily = db.execute(
        """
        SELECT date(booked_at) AS day, COUNT(*) AS bookings
        FROM bookings
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
        """
    ).fetchall()
    occupancy = db.execute(
        """
        SELECT t.id, t.route_from, t.route_to, t.travel_date,
               COUNT(b.id) AS seats_booked,
               ROUND((COUNT(b.id) / ?) * 100, 1) AS occupancy_pct
        FROM trips t
        LEFT JOIN bookings b ON b.trip_id = t.id
        GROUP BY t.id
        ORDER BY t.travel_date DESC
        """,
        (float(SEAT_CAPACITY),),
    ).fetchall()
    return render_template(
        "reports.html",
        active="reports",
        daily=daily,
        occupancy=occupancy,
        counts=fetch_sidebar_counts(),
    )


@app.route("/settings", methods=["GET", "POST"])
def settings() -> str:
    db = get_db()
    if request.method == "POST":
        db.execute(
            """
            UPDATE settings
            SET sacco_name=?, contact_phone=?, logo_url=?, fare_rules=?, mpesa_enabled=?
            WHERE id=1
            """,
            (
                request.form["sacco_name"],
                request.form["contact_phone"],
                request.form.get("logo_url"),
                request.form["fare_rules"],
                1 if request.form.get("mpesa_enabled") else 0,
            ),
        )
        db.commit()
        flash("Settings saved.", "success")
        return redirect(url_for("settings"))

    row = db.execute("SELECT * FROM settings WHERE id=1").fetchone()
    return render_template("settings.html", active="settings", settings=row, counts=fetch_sidebar_counts())


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(debug=True)
