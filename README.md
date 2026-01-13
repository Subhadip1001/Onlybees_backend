# Ticket Booking Backend

A Node.js/Express API for managing ticket bookings with concurrent request handling and race condition prevention.

## Overview

This is a robust ticket booking system that manages events with multiple sections and handles concurrent booking requests safely. The system prevents overselling through MongoDB's atomic operations and query-level locking.

## Project Structure

```
.
├── src/
│   ├── app.js                 # Express application setup
│   ├── config/
│   │   └── db.js             # MongoDB connection configuration
│   ├── controllers/
│   │   ├── bookingController.js
│   │   └── eventController.js
│   ├── models/
│   │   ├── Booking.js
│   │   └── Event.js
│   ├── routes/
│   │   ├── bookingRoutes.js
│   │   └── eventRoutes.js
│   └── services/
│       └── bookingService.js
├── scripts/
│   └── simulateConcurrency.js # Concurrency testing script
├── server.js                   # Server entry point
├── package.json
├── .env
└── README.md
```

## Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file with:
   ```
   PORT=4521
   MONGO_URI=mongodb://localhost:27017/ticketbooking
   ```

3. **Ensure MongoDB is running** on your local machine or update `MONGO_URI` to your MongoDB instance.

## Running the Application

**Start the server:**
```bash
npm start
```

The server will start on `http://localhost:4521` and display:
```
Server is running on port 4521
MongoDB connected successfully
```

## API Endpoints

### Events

- **Create Event**
  ```
  POST /events/create
  ```
  Request body:
  ```json
  {
    "name": "Concert 2024",
    "sections": [
      { "name": "VIP", "price": 100, "capacity": 50 },
      { "name": "General", "price": 50, "capacity": 200 }
    ]
  }
  ```

- **Get Event Details**
  ```
  GET /events/:id
  ```
  Returns event information including remaining seats per section.

### Bookings

- **Create Booking**
  ```
  POST /book
  ```
  Request body:
  ```json
  {
    "eventId": "event_id_here",
    "sectionId": "section_id_here",
    "qty": 2
  }
  ```

- **List All Bookings**
  ```
  GET /bookings
  ```
  Returns all bookings sorted by creation date (newest first).

## Locking Strategy & Concurrency Handling

### Problem Statement

Ticket booking systems face critical concurrency challenges:
- **Race Condition Risk**: Multiple simultaneous booking requests can lead to overselling
- **Data Integrity**: Without proper locking, the remaining seat count can become inconsistent
- **Atomicity**: Booking operations must be all-or-nothing to prevent partial state updates

### Solution: MongoDB Atomic Operations

This application uses **MongoDB's atomic `findOneAndUpdate()` operation** to prevent race conditions:

#### Key Implementation Details

In [`src/services/bookingService.js`](src/services/bookingService.js), the [`bookTicket`](src/services/bookingService.js) function employs:

```javascript
const updatedEvent = await Event.findOneAndUpdate(
  {
    _id: eventId,
    'sections._id': sectionId,
    'sections.remaining': { $gte: qty }  // ← CRITICAL: Atomic condition check
  },
  {
    $inc: { 'sections.$.remaining': -qty }  // ← Atomic decrement
  },
  { new: true }
);
```

#### How It Works

1. **Atomic Read-Modify-Write**: The `findOneAndUpdate()` operation is atomic at the database level. MongoDB acquires a lock on the document before executing the operation.

2. **Query-Level Condition Check**: The filter `'sections.remaining': { $gte: qty }` ensures that the update only succeeds if sufficient seats are available. If not, `null` is returned.

3. **Positional Operator (`$`)**: The `$inc: { 'sections.$.remaining': -qty }` atomically decrements the remaining count for the matched section without race conditions.

4. **All-or-Nothing Semantics**: Either the booking succeeds and seats are decremented, or it fails completely. There is no intermediate state.

#### Concurrency Guarantee

**Maximum Bookings = Event Capacity**

Even with 100 concurrent requests for 5 available seats:
- The first 5 requests will succeed
- The remaining 95 requests will fail with "Not enough seats available"
- No overselling occurs because MongoDB ensures atomicity at the document level

### Testing Concurrency

Run the concurrency test script:
```bash
node scripts/simulateConcurrency.js
```

This script:
1. Creates an event with a section of limited capacity (default: 5 seats)
2. Sends 10 parallel booking requests simultaneously
3. Verifies that exactly 5 bookings succeed and 5 fail
4. Confirms remaining seats are exactly 0 (no negative values or overselling)

**Expected Output:**
```
--- STARTING CONCURRENCY TEST ---
Creating test event with capacity: 5...
Event Created! ID: ...
Simulating 10 parallel booking requests...

--- RESULTS ---
Total Requests: 10
Successful Bookings: 5
Failed Bookings:     5

Final DB State:
Remaining Seats: 0

✅ TEST PASSED: Perfectly sold out without overselling.
```

### Why This Approach?

| Aspect | Solution | Benefit |
|--------|----------|---------|
| **Lock Type** | Document-level atomic operation | Minimal lock contention, high throughput |
| **Consistency Model** | Strong consistency | Immediate visibility of all bookings |
| **Scalability** | Shardable by eventId | Can scale horizontally if needed |
| **Complexity** | Single database operation | No distributed locking overhead |

## Dependencies

- **express**: Web framework
- **mongoose**: MongoDB ODM
- **dotenv**: Environment variable management
- **axios**: HTTP client (for testing)
- **nodemon**: Development server with auto-reload

## Error Handling

The API returns appropriate HTTP status codes:
- `201`: Booking successful
- `400`: Invalid input or insufficient seats
- `404`: Event/endpoint not found
- `500`: Server error

## Models

### Event Model
Stores event information with sections containing pricing and seat capacity.

### Booking Model
Records each ticket booking with a reference to the event and section.

## Notes

- Ensure MongoDB is running before starting the server
- The `.env` file should never be committed to version control
- Use `nodemon` during development for automatic server restarts

---

**Author**: Subhadip Mandal  
**License**: ISC