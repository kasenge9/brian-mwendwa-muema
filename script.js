const CAPACITY = 14;
const STORAGE_KEY = "kinatwa_bookings";

const bookingForm = document.getElementById("booking-form");
const seatGrid = document.getElementById("seat-grid");
const bookingList = document.getElementById("booking-list");
const clearBookingsButton = document.getElementById("clear-bookings");
const formMessage = document.getElementById("form-message");

const getBookings = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const saveBookings = (bookings) => localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));

const bookedSeats = () => {
  const bookings = getBookings();
  return new Set(bookings.flatMap((booking) => booking.seats));
};

const createSeatElement = (seatNumber, isBooked) => {
  const label = document.createElement("label");
  label.className = `seat ${isBooked ? "booked" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = String(seatNumber);
  checkbox.disabled = isBooked;

  checkbox.addEventListener("change", () => {
    label.classList.toggle("selected", checkbox.checked);
  });

  const text = document.createElement("span");
  text.textContent = `Seat ${seatNumber}`;

  label.append(checkbox, text);
  return label;
};

const renderSeats = () => {
  seatGrid.innerHTML = "";
  const takenSeats = bookedSeats();

  for (let i = 1; i <= CAPACITY; i += 1) {
    seatGrid.appendChild(createSeatElement(i, takenSeats.has(i)));
  }
};

const renderBookings = () => {
  const bookings = getBookings();
  bookingList.innerHTML = "";

  if (bookings.length === 0) {
    const empty = document.createElement("li");
    empty.className = "booking-item";
    empty.textContent = "No bookings yet.";
    bookingList.appendChild(empty);
    return;
  }

  bookings
    .sort((a, b) => new Date(a.travelDate) - new Date(b.travelDate))
    .forEach((booking) => {
      const li = document.createElement("li");
      li.className = "booking-item";
      li.innerHTML = `
        <strong>${booking.fullName}</strong><br>
        Phone: ${booking.phone}<br>
        Date: ${booking.travelDate} at ${booking.departureTime}<br>
        Seat(s): ${booking.seats.join(", ")}
      `;
      bookingList.appendChild(li);
    });
};

const showMessage = (message, type) => {
  formMessage.className = `message ${type}`;
  formMessage.textContent = message;
};

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const travelDate = document.getElementById("travelDate").value;
  const departureTime = document.getElementById("departureTime").value;

  const selectedSeats = [...seatGrid.querySelectorAll("input:checked")].map((seatInput) =>
    Number(seatInput.value)
  );

  if (!fullName || !phone || !travelDate || !departureTime) {
    showMessage("Please fill in all fields.", "error");
    return;
  }

  if (selectedSeats.length === 0) {
    showMessage("Please select at least one available seat.", "error");
    return;
  }

  const takenSeats = bookedSeats();
  const overlap = selectedSeats.some((seat) => takenSeats.has(seat));
  if (overlap) {
    showMessage("One or more selected seats are already booked. Please try again.", "error");
    renderSeats();
    return;
  }

  const bookings = getBookings();
  bookings.push({
    fullName,
    phone,
    travelDate,
    departureTime,
    seats: selectedSeats.sort((a, b) => a - b),
  });

  saveBookings(bookings);
  bookingForm.reset();
  showMessage("Booking created successfully.", "success");
  renderSeats();
  renderBookings();
});

clearBookingsButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  showMessage("All bookings have been cleared.", "success");
  renderSeats();
  renderBookings();
});

renderSeats();
renderBookings();
