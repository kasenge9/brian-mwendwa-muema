const CAPACITY = 16;
const HOLD_MINUTES = 5;
const MAX_MULTI_BOOK = 4;

const STORAGE_KEYS = {
  trips: "kinatawa_trips",
  bookings: "kinatawa_bookings",
  holds: "kinatawa_holds",
};

const sessionId = `session-${Math.random().toString(36).slice(2, 10)}`;
let activeTripId = null;
let selectedSeats = [];
let latestTicket = null;

const seatLayoutRows = [
  [1, 2, null, 3, 4],
  [5, 6, null, 7, 8],
  [9, 10, null, 11, 12],
  [13, 14, null, 15, 16],
];

const els = {
  searchForm: document.getElementById("search-form"),
  routeFrom: document.getElementById("route-from"),
  routeTo: document.getElementById("route-to"),
  travelDate: document.getElementById("travel-date"),
  passengerCount: document.getElementById("passenger-count"),
  tripResults: document.getElementById("trip-results"),
  selectedTripText: document.getElementById("selected-trip-text"),
  seatMap: document.getElementById("seat-map"),
  checkoutForm: document.getElementById("checkout-form"),
  passengerName: document.getElementById("passenger-name"),
  passengerPhone: document.getElementById("passenger-phone"),
  passengerId: document.getElementById("passenger-id"),
  passengerEmail: document.getElementById("passenger-email"),
  payButton: document.getElementById("pay-button"),
  checkoutSummary: document.getElementById("checkout-summary"),
  ticketCard: document.getElementById("ticket-card"),
  printTicket: document.getElementById("print-ticket"),
  downloadTicket: document.getElementById("download-ticket"),
  trackerLabel: document.getElementById("tracker-label"),
  trackerProgress: document.getElementById("tracker-progress"),
  bookingList: document.getElementById("booking-list"),
  clearBookings: document.getElementById("clear-bookings"),
  adminTripForm: document.getElementById("admin-trip-form"),
  adminTripList: document.getElementById("admin-trip-list"),
  adminKpis: document.getElementById("admin-kpis"),
  adminFrom: document.getElementById("admin-from"),
  adminTo: document.getElementById("admin-to"),
  adminDate: document.getElementById("admin-date"),
  adminTime: document.getElementById("admin-time"),
  adminPrice: document.getElementById("admin-price"),
  messages: {
    search: document.getElementById("search-message"),
    seat: document.getElementById("seat-message"),
    checkout: document.getElementById("checkout-message"),
    admin: document.getElementById("admin-message"),
    tracker: document.getElementById("tracker-message"),
  },
};

const todayISO = new Date().toISOString().split("T")[0];
els.travelDate.min = todayISO;
els.adminDate.min = todayISO;
els.travelDate.value = todayISO;
els.adminDate.value = todayISO;

const readStore = (key, fallback = []) => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const showMessage = (target, text, type = "info") => {
  const el = els.messages[target];
  el.className = `message ${type}`;
  el.textContent = text;
};

const sanitizeText = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatKES = (amount) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);

const isWeekend = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
};

const departureHour = (time) => Number((time || "00:00").split(":")[0]);

const computeFare = (trip) => {
  const weekendMultiplier = isWeekend(trip.date) ? 1.15 : 1;
  const peakMultiplier = departureHour(trip.time) >= 17 || departureHour(trip.time) < 8 ? 1.1 : 1;
  const unitPrice = Math.round(trip.price * weekendMultiplier * peakMultiplier);
  const surchargeInfo = [];
  if (weekendMultiplier > 1) surchargeInfo.push("Weekend +15%");
  if (peakMultiplier > 1) surchargeInfo.push("Peak-hour +10%");
  return {
    unitPrice,
    surchargeInfo: surchargeInfo.length ? surchargeInfo.join(" · ") : "Standard fare",
  };
};

const seedTrips = () => {
  const trips = readStore(STORAGE_KEYS.trips);
  if (trips.length) return;

  const d1 = new Date();
  d1.setDate(d1.getDate() + 1);
  const d2 = new Date();
  d2.setDate(d2.getDate() + 2);

  writeStore(STORAGE_KEYS.trips, [
    { id: crypto.randomUUID(), from: "Mombasa", to: "Nairobi", date: d1.toISOString().split("T")[0], time: "06:30", price: 1800, cancelled: false, driver: "Alex Mwangi", driverPhone: "+254712345678" },
    { id: crypto.randomUUID(), from: "Mombasa", to: "Nairobi", date: d1.toISOString().split("T")[0], time: "14:00", price: 1600, cancelled: false, driver: "Neema Juma", driverPhone: "+254723456789" },
    { id: crypto.randomUUID(), from: "Nairobi", to: "Mombasa", date: d2.toISOString().split("T")[0], time: "18:15", price: 1900, cancelled: false, driver: "David Otieno", driverPhone: "+254734567890" },
  ]);
};

const purgeExpiredHolds = () => {
  const now = Date.now();
  const valid = readStore(STORAGE_KEYS.holds).filter((hold) => hold.expiresAt > now);
  writeStore(STORAGE_KEYS.holds, valid);
  return valid;
};

const holdKey = (tripId, seat) => `${tripId}-${seat}`;

const releaseMyHolds = (tripId, seats = selectedSeats) => {
  const keySet = new Set(seats.map((seat) => holdKey(tripId, seat)));
  const next = purgeExpiredHolds().filter(
    (hold) => !(hold.sessionId === sessionId && keySet.has(holdKey(hold.tripId, hold.seat)))
  );
  writeStore(STORAGE_KEYS.holds, next);
};

const createHold = (tripId, seat) => {
  const holds = purgeExpiredHolds();
  const alreadyHeld = holds.some((hold) => hold.tripId === tripId && hold.seat === seat);
  if (alreadyHeld) return false;
  holds.push({
    tripId,
    seat,
    sessionId,
    expiresAt: Date.now() + HOLD_MINUTES * 60 * 1000,
  });
  writeStore(STORAGE_KEYS.holds, holds);
  return true;
};

const findTripById = (tripId) => readStore(STORAGE_KEYS.trips).find((trip) => trip.id === tripId);
const bookingsForTrip = (tripId) => readStore(STORAGE_KEYS.bookings).filter((b) => b.tripId === tripId);
const bookedSeatSet = (tripId) => new Set(bookingsForTrip(tripId).flatMap((b) => b.seats));
const heldSeatSet = (tripId) => {
  const holds = purgeExpiredHolds().filter((h) => h.tripId === tripId && h.sessionId !== sessionId);
  return new Set(holds.map((h) => h.seat));
};
const seatsAvailableForTrip = (tripId) => CAPACITY - bookedSeatSet(tripId).size - heldSeatSet(tripId).size;

const getPassengerCount = () => Math.min(MAX_MULTI_BOOK, Math.max(1, Number(els.passengerCount.value) || 1));

const renderTripResults = (trips) => {
  els.tripResults.innerHTML = "";
  if (!trips.length) {
    els.tripResults.innerHTML = '<div class="trip-card">No matching trips found for your search.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  trips.forEach((trip) => {
    const seatsLeft = trip.cancelled ? 0 : seatsAvailableForTrip(trip.id);
    const fare = computeFare(trip);
    const card = document.createElement("article");
    card.className = "trip-card";
    card.innerHTML = `
      <strong>${sanitizeText(trip.from)} → ${sanitizeText(trip.to)}</strong>
      <div class="trip-card__meta">${trip.date} · ${trip.time} · Base ${formatKES(trip.price)}</div>
      <div class="trip-card__meta">Live fare: ${formatKES(fare.unitPrice)} per passenger (${fare.surchargeInfo})</div>
      <div class="trip-card__meta">Seats left: ${seatsLeft}/${CAPACITY} ${trip.cancelled ? "(Cancelled)" : ""}</div>
      <div class="trip-actions">
        <button type="button" ${trip.cancelled || seatsLeft === 0 ? "disabled" : ""}>Select Trip</button>
        <button type="button" class="secondary" ${trip.driverPhone ? "" : "disabled"}>WhatsApp Driver</button>
      </div>
    `;

    const [selectBtn, whatsappBtn] = card.querySelectorAll("button");
    selectBtn.addEventListener("click", () => {
      if (activeTripId && selectedSeats.length) {
        releaseMyHolds(activeTripId, selectedSeats);
      }
      activeTripId = trip.id;
      selectedSeats = [];
      renderSeatMap();
      renderCheckoutSummary();
      updateTracker();
      showMessage("seat", `Trip selected. Choose up to ${getPassengerCount()} seat(s).`, "success");
      els.selectedTripText.textContent = `Selected trip: ${trip.from} → ${trip.to} on ${trip.date} at ${trip.time}. Driver: ${trip.driver} (${trip.driverPhone})`;
    });

    whatsappBtn.addEventListener("click", () => {
      const text = encodeURIComponent(`Hello ${trip.driver}, I am interested in Kinatawa trip ${trip.from} to ${trip.to} on ${trip.date} at ${trip.time}.`);
      window.open(`https://wa.me/${trip.driverPhone.replace(/\D/g, "")}?text=${text}`, "_blank");
    });

    frag.appendChild(card);
  });

  els.tripResults.appendChild(frag);
};

const renderSeatMap = () => {
  els.seatMap.innerHTML = "";
  if (!activeTripId) return;

  const trip = findTripById(activeTripId);
  if (!trip || trip.cancelled) {
    showMessage("seat", "Selected trip is unavailable. Please select another trip.", "error");
    activeTripId = null;
    selectedSeats = [];
    return;
  }

  const booked = bookedSeatSet(activeTripId);
  const held = heldSeatSet(activeTripId);
  const maxSelectable = getPassengerCount();

  seatLayoutRows.forEach((row) => {
    row.forEach((seat) => {
      if (seat === null) {
        const aisle = document.createElement("div");
        aisle.className = "aisle";
        els.seatMap.appendChild(aisle);
        return;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat";
      btn.textContent = seat;

      const isSelected = selectedSeats.includes(seat);
      if (booked.has(seat)) {
        btn.classList.add("booked");
        btn.disabled = true;
      } else if (held.has(seat)) {
        btn.classList.add("held");
        btn.disabled = true;
      } else if (isSelected) {
        btn.classList.add("selected");
      }

      btn.addEventListener("click", () => {
        if (selectedSeats.includes(seat)) {
          releaseMyHolds(activeTripId, [seat]);
          selectedSeats = selectedSeats.filter((s) => s !== seat);
          showMessage("seat", `Seat ${seat} removed from selection.`, "info");
        } else {
          if (selectedSeats.length >= maxSelectable) {
            showMessage("seat", `You selected ${maxSelectable} passenger(s). Increase passengers to add more seats.`, "error");
            return;
          }
          const heldCreated = createHold(activeTripId, seat);
          if (!heldCreated) {
            showMessage("seat", `Seat ${seat} is temporarily held by another user.`, "error");
            return;
          }
          selectedSeats.push(seat);
          selectedSeats.sort((a, b) => a - b);
          showMessage("seat", `Seat ${seat} held for ${HOLD_MINUTES} minutes.`, "success");
        }

        renderSeatMap();
        renderCheckoutSummary();
        renderTripResults(readStore(STORAGE_KEYS.trips).filter((tripOption) => !tripOption.cancelled));
      });

      els.seatMap.appendChild(btn);
    });
  });
};

const renderCheckoutSummary = () => {
  if (!activeTripId || !selectedSeats.length) {
    els.checkoutSummary.innerHTML = "<p class='muted'>Select trip and seat(s) to see price breakdown.</p>";
    return;
  }
  const trip = findTripById(activeTripId);
  if (!trip) return;

  const fare = computeFare(trip);
  const subtotal = fare.unitPrice * selectedSeats.length;
  const serviceFee = Math.round(subtotal * 0.02);
  const total = subtotal + serviceFee;

  els.checkoutSummary.innerHTML = `
    <div class="booking-meta">
      <strong>Trip:</strong> ${sanitizeText(trip.from)} → ${sanitizeText(trip.to)}<br>
      <strong>Departure:</strong> ${trip.date} ${trip.time}<br>
      <strong>Driver:</strong> ${sanitizeText(trip.driver)} (${sanitizeText(trip.driverPhone)})<br>
      <strong>Seats:</strong> ${selectedSeats.join(", ")} (${selectedSeats.length} passenger(s))<br>
      <strong>Unit Fare:</strong> ${formatKES(fare.unitPrice)}<br>
      <strong>Subtotal:</strong> ${formatKES(subtotal)}<br>
      <strong>Service Fee (2%):</strong> ${formatKES(serviceFee)}<br>
      <strong>Total:</strong> ${formatKES(total)}
    </div>
  `;
};

const updateTracker = () => {
  if (!activeTripId) {
    els.trackerLabel.textContent = "Select a trip to view progress status.";
    els.trackerProgress.style.width = "0%";
    showMessage("tracker", "No active trip selected.", "info");
    return;
  }

  const trip = findTripById(activeTripId);
  if (!trip) return;

  const now = new Date();
  const depart = new Date(`${trip.date}T${trip.time}:00`);
  const arrive = new Date(depart.getTime() + 6 * 60 * 60 * 1000);

  let progress = 0;
  let status = "Scheduled";

  if (now >= arrive) {
    progress = 100;
    status = "Arrived";
  } else if (now >= depart) {
    progress = ((now - depart) / (arrive - depart)) * 100;
    status = "On the road";
  }

  els.trackerLabel.textContent = `Route ${trip.from} → ${trip.to} | ${trip.date} ${trip.time}`;
  els.trackerProgress.style.width = `${Math.max(0, Math.min(100, progress)).toFixed(0)}%`;
  showMessage("tracker", `${status} (${Math.round(progress)}% trip progress)`, status === "On the road" ? "success" : "info");
};

const renderTicket = () => {
  if (!latestTicket) {
    els.ticketCard.className = "ticket empty";
    els.ticketCard.innerHTML = "<p>No confirmed ticket yet. Complete checkout to generate your ticket.</p>";
    els.printTicket.disabled = true;
    els.downloadTicket.disabled = true;
    return;
  }

  els.ticketCard.className = "ticket";
  els.ticketCard.innerHTML = `
    <h3>Kinatawa e-Ticket</h3>
    <p><strong>Booking ID:</strong> ${latestTicket.bookingId}</p>
    <p><strong>Passenger:</strong> ${sanitizeText(latestTicket.passengerName)}</p>
    <p><strong>Route:</strong> ${sanitizeText(latestTicket.from)} → ${sanitizeText(latestTicket.to)}</p>
    <p><strong>Departure:</strong> ${latestTicket.date} ${latestTicket.time}</p>
    <p><strong>Seats:</strong> ${latestTicket.seats.join(", ")}</p>
    <p><strong>Total Paid:</strong> ${formatKES(latestTicket.total)}</p>
    <p><strong>Driver Contact:</strong> ${sanitizeText(latestTicket.driver)} (${sanitizeText(latestTicket.driverPhone)})</p>
    <p><strong>Payment:</strong> Paid via M-Pesa STK (${sanitizeText(latestTicket.phone)})</p>
  `;

  els.printTicket.disabled = false;
  els.downloadTicket.disabled = false;
};

const renderBookings = () => {
  const bookings = readStore(STORAGE_KEYS.bookings).sort((a, b) => b.createdAt - a.createdAt);
  els.bookingList.innerHTML = "";

  if (!bookings.length) {
    els.bookingList.innerHTML = '<li class="booking-item">No bookings yet.</li>';
    return;
  }

  const frag = document.createDocumentFragment();
  bookings.slice(0, 12).forEach((booking) => {
    const li = document.createElement("li");
    li.className = "booking-item";
    li.innerHTML = `
      <strong>${sanitizeText(booking.passengerName)}</strong> · Seats ${booking.seats.join(", ")}
      <div class="booking-meta">${sanitizeText(booking.from)} → ${sanitizeText(booking.to)} · ${booking.date} ${booking.time}</div>
      <div class="booking-meta">${booking.bookingId} · ${sanitizeText(booking.phone)} · ${formatKES(booking.total)}</div>
    `;
    frag.appendChild(li);
  });

  els.bookingList.appendChild(frag);
};

const renderAdmin = () => {
  const trips = readStore(STORAGE_KEYS.trips).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const bookings = readStore(STORAGE_KEYS.bookings);
  const totalRevenue = bookings.reduce((sum, b) => sum + b.total, 0);
  const totalSeatsSold = bookings.reduce((sum, b) => sum + b.seats.length, 0);

  els.adminKpis.innerHTML = `
    <div class="kpi"><strong>Trips</strong><br>${trips.length}</div>
    <div class="kpi"><strong>Bookings</strong><br>${bookings.length}</div>
    <div class="kpi"><strong>Seats Sold</strong><br>${totalSeatsSold}</div>
    <div class="kpi"><strong>Revenue</strong><br>${formatKES(totalRevenue)}</div>
  `;

  els.adminTripList.innerHTML = "";
  if (!trips.length) {
    els.adminTripList.innerHTML = '<div class="admin-trip">No trips configured yet.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  trips.forEach((trip) => {
    const occupancy = bookingsForTrip(trip.id).reduce((sum, b) => sum + b.seats.length, 0);
    const adminRow = document.createElement("div");
    adminRow.className = "admin-trip";
    adminRow.innerHTML = `
      <strong>${sanitizeText(trip.from)} → ${sanitizeText(trip.to)}</strong>
      <div class="trip-card__meta">${trip.date} ${trip.time} · Base ${formatKES(trip.price)} · Driver ${sanitizeText(trip.driver)}</div>
      <div class="trip-card__meta">Occupancy: ${occupancy}/${CAPACITY} ${trip.cancelled ? "· Cancelled" : ""}</div>
      <button type="button" class="secondary">${trip.cancelled ? "Reopen Trip" : "Cancel Trip"}</button>
    `;

    const btn = adminRow.querySelector("button");
    btn.addEventListener("click", () => {
      const update = readStore(STORAGE_KEYS.trips).map((t) =>
        t.id === trip.id ? { ...t, cancelled: !t.cancelled } : t
      );
      writeStore(STORAGE_KEYS.trips, update);
      if (activeTripId === trip.id && !trip.cancelled) {
        releaseMyHolds(activeTripId, selectedSeats);
        activeTripId = null;
        selectedSeats = [];
        renderSeatMap();
        renderCheckoutSummary();
      }
      renderAdmin();
      renderTripResults(update.filter((t) => !t.cancelled));
      showMessage("admin", "Trip status updated.", "success");
    });

    frag.appendChild(adminRow);
  });
  els.adminTripList.appendChild(frag);
};

els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const from = els.routeFrom.value;
  const to = els.routeTo.value;
  const date = els.travelDate.value;
  const passengers = getPassengerCount();

  if (!from || !to || !date) {
    showMessage("search", "Please choose from, to, and travel date.", "error");
    return;
  }

  if (from === to) {
    showMessage("search", "Departure and destination cannot be the same.", "error");
    return;
  }

  const matches = readStore(STORAGE_KEYS.trips).filter((trip) => {
    if (trip.cancelled) return false;
    if (trip.from !== from || trip.to !== to || trip.date !== date) return false;
    return seatsAvailableForTrip(trip.id) >= passengers;
  });

  renderTripResults(matches);
  showMessage("search", `${matches.length} trip(s) found for ${passengers} passenger(s).`, "success");
});

els.passengerCount.addEventListener("change", () => {
  if (selectedSeats.length > getPassengerCount()) {
    releaseMyHolds(activeTripId, selectedSeats.slice(getPassengerCount()));
    selectedSeats = selectedSeats.slice(0, getPassengerCount());
  }
  renderSeatMap();
  renderCheckoutSummary();
});

els.checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeTripId || !selectedSeats.length) {
    showMessage("checkout", "Select a trip and at least one seat before checkout.", "error");
    return;
  }

  const trip = findTripById(activeTripId);
  if (!trip || trip.cancelled) {
    showMessage("checkout", "Selected trip is unavailable.", "error");
    return;
  }

  const passengerName = els.passengerName.value.trim();
  const phone = els.passengerPhone.value.trim();
  const documentId = els.passengerId.value.trim();
  const email = els.passengerEmail.value.trim();

  if (!passengerName || !phone || !documentId) {
    showMessage("checkout", "Fill all required passenger/payment details.", "error");
    return;
  }

  const booked = bookedSeatSet(activeTripId);
  const conflict = selectedSeats.some((seat) => booked.has(seat));
  if (conflict) {
    showMessage("checkout", "One or more selected seats were booked moments ago. Re-select seats.", "error");
    renderSeatMap();
    return;
  }

  const fare = computeFare(trip);
  const subtotal = fare.unitPrice * selectedSeats.length;
  const serviceFee = Math.round(subtotal * 0.02);
  const total = subtotal + serviceFee;

  els.payButton.disabled = true;
  showMessage("checkout", "Sending STK push... please confirm on your phone.", "info");
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const booking = {
    bookingId: `KIN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    tripId: activeTripId,
    from: trip.from,
    to: trip.to,
    date: trip.date,
    time: trip.time,
    seats: [...selectedSeats],
    unitFare: fare.unitPrice,
    total,
    passengerName,
    phone,
    email,
    documentId,
    driver: trip.driver,
    driverPhone: trip.driverPhone,
    paymentStatus: "paid",
    createdAt: Date.now(),
  };

  const allBookings = readStore(STORAGE_KEYS.bookings);
  allBookings.push(booking);
  writeStore(STORAGE_KEYS.bookings, allBookings);
  releaseMyHolds(activeTripId, selectedSeats);

  latestTicket = booking;
  selectedSeats = [];
  els.checkoutForm.reset();
  els.payButton.disabled = false;

  showMessage("checkout", "Payment confirmed. Ticket generated successfully.", "success");
  renderTicket();
  renderBookings();
  renderSeatMap();
  renderCheckoutSummary();
  renderAdmin();
  renderTripResults(readStore(STORAGE_KEYS.trips).filter((tripEntry) => !tripEntry.cancelled));
});

els.printTicket.addEventListener("click", () => {
  if (!latestTicket) return;
  window.print();
});

els.downloadTicket.addEventListener("click", () => {
  if (!latestTicket) return;

  const text = [
    "KINATAWA E-TICKET",
    `Booking ID: ${latestTicket.bookingId}`,
    `Passenger: ${latestTicket.passengerName}`,
    `Route: ${latestTicket.from} -> ${latestTicket.to}`,
    `Departure: ${latestTicket.date} ${latestTicket.time}`,
    `Seats: ${latestTicket.seats.join(", ")}`,
    `Total Paid: ${formatKES(latestTicket.total)}`,
    `Driver: ${latestTicket.driver} (${latestTicket.driverPhone})`,
  ].join("\n");

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${latestTicket.bookingId}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

els.clearBookings.addEventListener("click", () => {
  writeStore(STORAGE_KEYS.bookings, []);
  writeStore(STORAGE_KEYS.holds, []);
  latestTicket = null;
  if (activeTripId) {
    releaseMyHolds(activeTripId, selectedSeats);
  }
  selectedSeats = [];

  renderTicket();
  renderBookings();
  renderSeatMap();
  renderCheckoutSummary();
  renderAdmin();
  showMessage("checkout", "All bookings and temporary seat holds cleared.", "info");
});

els.adminTripForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const from = els.adminFrom.value.trim();
  const to = els.adminTo.value.trim();
  const date = els.adminDate.value;
  const time = els.adminTime.value;
  const price = Number(els.adminPrice.value);

  if (!from || !to || !date || !time || !Number.isFinite(price) || price <= 0) {
    showMessage("admin", "Enter valid trip data and positive base price.", "error");
    return;
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    showMessage("admin", "Route from/to must be different.", "error");
    return;
  }

  const driverPool = [
    { name: "Alex Mwangi", phone: "+254712345678" },
    { name: "Neema Juma", phone: "+254723456789" },
    { name: "David Otieno", phone: "+254734567890" },
    { name: "Fatma Ali", phone: "+254745678901" },
  ];
  const assigned = driverPool[Math.floor(Math.random() * driverPool.length)];

  const trips = readStore(STORAGE_KEYS.trips);
  trips.push({
    id: crypto.randomUUID(),
    from,
    to,
    date,
    time,
    price,
    cancelled: false,
    driver: assigned.name,
    driverPhone: assigned.phone,
  });

  writeStore(STORAGE_KEYS.trips, trips);
  els.adminTripForm.reset();
  els.adminDate.value = todayISO;
  showMessage("admin", "Trip added successfully.", "success");
  renderAdmin();
  renderTripResults(trips.filter((t) => !t.cancelled));
});

seedTrips();
purgeExpiredHolds();
renderTripResults(readStore(STORAGE_KEYS.trips).filter((t) => !t.cancelled));
renderSeatMap();
renderCheckoutSummary();
updateTracker();
renderTicket();
renderBookings();
renderAdmin();
showMessage("search", "Search by route/date and passenger count to find matching trips.", "info");
