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

### 1. What Was The Overselling Problem?

#### The Issue

Without proper concurrency control, ticket booking systems are vulnerable to **overselling** — selling more tickets than physical capacity exists:

**Example of Race Condition:**
```
Event: Concert with VIP section
Capacity: 5 seats
Current Remaining: 1 seat

Timeline (without locking):
┌─────────────────────────────────────────────────┐
│ Request A        │ Request B       │ Database   │
├─────────────────────────────────────────────────┤
│ Check: 1 >= 1? ✓ │                 │ Remaining: 1
│                  │ Check: 1 >= 1? ✓ │
│ Decrement by 1   │                 │ Remaining: 1
│                  │ Decrement by 1   │
│                  │                 │ Remaining: 0 ❌
│                  │                 │
│ Result: OVERSOLD! Both succeeded but capacity was 5, we sold 6 total.
└─────────────────────────────────────────────────┘
```

#### Why This Happens

In a **non-atomic** booking process:
1. **Read Phase**: Application checks available seats (e.g., 1 seat left)
2. **Race Window**: Between checking and updating, another request checks the same 1 seat
3. **Write Phase**: Both requests decrement the count

Since the "check" and "update" are separate operations, the database doesn't know they should be atomic, leading to **lost updates**.

#### Impact

- **Financial Loss**: Venue oversells tickets, cannot honor commitments
- **Reputation Damage**: Customers turned away at events
- **Revenue Mismatch**: Database shows negative remaining seats
- **Overbooking**: More bookings exist than physical capacity

---

### 2. What Exact Mechanism Did They Implement?

#### MongoDB Atomic `findOneAndUpdate()` with Conditional Check

The solution uses **MongoDB's document-level atomicity**:

```javascript
// File: src/services/bookingService.js
const updatedEvent = await Event.findOneAndUpdate(
  {
    _id: eventId,                           // ① Find the event
    'sections._id': sectionId,              // ② Find the specific section
    'sections.remaining': { $gte: qty }     // ③ ATOMIC condition: seats available?
  },
  {
    $inc: { 'sections.$.remaining': -qty }  // ④ ATOMIC decrement
  },
  { new: true }                              // ⑤ Return updated document
);

// If condition in filter fails, updatedEvent is null
if (!updatedEvent) {
  throw new Error('Not enough seats available');
}
```

#### How Each Component Works

| Component | Role | Why It Matters |
|-----------|------|----------------|
| **Query Filter** | Specifies the condition that MUST be true before the update | MongoDB won't update if `remaining < qty` |
| **`'sections.remaining': { $gte: qty }`** | Atomic check for seat availability | Prevents update if insufficient seats |
| **`$inc` Operator** | Atomic increment/decrement operation | Safely reduces remaining seats |
| **`$.` Positional Operator** | Identifies which array element to update | Updates only the matched section |
| **`{ new: true }`** | Returns the updated document | Confirms booking was successful |

#### The Critical Guarantee

MongoDB's `findOneAndUpdate()` is **atomic at the document level**:
- MongoDB locks the document
- Evaluates the filter condition
- If true: applies the update
- If false: returns null
- Then releases the lock
- **All as ONE indivisible operation** from the application's perspective

```
Timeline (WITH atomic operation):
┌──────────────────────────────────────────────────────┐
│ Request A                 │ Request B      │ Database │
├──────────────────────────────────────────────────────┤
│ findOneAndUpdate()        │                │ Locked   │
│ ✓ Check: 1 >= 1?         │                │ Locked   │
│ ✓ Decrement by 1         │                │ Remaining: 0
│ Release lock             │                │ Unlocked │
│                          │ findOneAndUpdate()
│                          │ ✓ Check: 0 >= 1? ✗
│                          │ Update FAILS!   │ Remaining: 0
│                          │ Release lock    │ Unlocked │
│                          │                 │
│ Result: ✅ CORRECT! Only Request A succeeded
└──────────────────────────────────────────────────────┘
```

#### Real Code Path in the Application

The booking flow:
1. **API Request**: `POST /book` with `{ eventId, sectionId, qty }`
2. **Controller** ([`src/controllers/bookingController.js`](src/controllers/bookingController.js)):
   - Validates input
   - Calls `bookTicket(eventId, sectionId, qty)`
3. **Service** ([`src/services/bookingService.js`](src/services/bookingService.js)):
   - Executes atomic `findOneAndUpdate()`
   - If successful: Creates `Booking` record
   - If fails: Throws "Not enough seats available"
4. **Response**: Returns booking object or error

---

### 3. Why Is It Safe (Or Safe Enough) In This Setup?

#### Strengths of This Implementation

##### ✅ **Database-Level Atomicity**
- MongoDB guarantees the read-check-update sequence cannot be interrupted
- No application-level race condition window
- Works even with multiple Node.js processes accessing the same database

##### ✅ **Strong Consistency**
- Immediate visibility of bookings
- No eventual consistency delays (unlike some distributed systems)
- All subsequent reads see the updated state

##### ✅ **Tested & Verified**
The concurrency test script (`scripts/simulateConcurrency.js`) validates the mechanism:
```bash
node scripts/simulateConcurrency.js
```

Sends 20 concurrent requests to book 1 seat each from an event with 5 seats:
- **Expected Result**: 5 succeed, 15 fail
- **Verification**: Check that final `remaining = 0` (no overselling)
- **Proof**: If the mechanism failed, we'd see remaining = negative or `> 5` bookings

Sample output:
```
✅ TEST PASSED: Perfectly sold out without overselling.
Total Requests: 20
Successful Bookings: 5
Failed Bookings: 15
Final Remaining Seats: 0
```

##### ✅ **Simple & Maintainable**
- Single database call = easier to reason about
- No distributed locks or external state
- No complex deadlock scenarios

#### Limitations (When To Be Cautious)

| Scenario | Risk | Notes |
|----------|------|-------|
| **Sharded MongoDB Cluster** | Moderate | If sharding key ≠ eventId, need careful shard key selection |
| **Network Partition** | Low | MongoDB handles via replica sets + write concerns |
| **Very High Scale (>10k req/sec)** | Acceptable | MongoDB can handle but may need optimization |
| **Multi-Data Center** | Low | Use MongoDB Atlas multi-region replicas |

#### Why It's "Safe Enough"

For a **production ticket booking system**, this approach is safe because:

1. **Atomicity Guarantees**: MongoDB document-level locks prevent race conditions
2. **No Intermediate State**: Either booking succeeds fully or fails fully
3. **Testable**: The concurrency test proves correctness
4. **Industry Standard**: Major ticketing systems use similar approaches
5. **Measurable**: Database state is never inconsistent (no negative seats)

The mechanism **prevents overselling** — the #1 requirement for booking systems.

---

### 4. What Would They Improve In A Real Production System?

#### High-Priority Improvements

##### 1. **Pessimistic Locking with Expiry (Session-Based)**
**Current Issue**: A user could view available seats, book them, but another user might book first (between viewing and booking)

**Improvement**: Hold a temporary lock on seats during the booking process
```javascript
// Pseudo-code: Reserve seats for 5 minutes
const reservation = await Reservation.findOneAndUpdate(
  { eventId, sectionId, status: 'available' },
  { 
    $set: { 
      userId: req.user.id,
      status: 'reserved',
      expiresAt: Date.now() + 5*60*1000  // 5 minute hold
    }
  }
);

// Later, convert reservation to booking
if (reservation) {
  // Create booking from reserved seats
}

// After 5 minutes, release unused reservations
```

##### 2. **Multiple Replica Sets with Write Concern**
```javascript
// Ensure write is committed to multiple replicas
const result = await Event.findOneAndUpdate(
  { query },
  { update },
  { 
    new: true,
    writeConcern: { w: 3 }  // Wait for 3 replica acknowledgments
  }
);
```

##### 3. **Event-Sourcing For Audit Trail**
```javascript
// Log every booking attempt (success or failure)
const bookingEvent = {
  type: 'BOOKING_ATTEMPT',
  eventId,
  sectionId,
  qty,
  userId,
  timestamp,
  status: 'SUCCESS' | 'FAILED',
  reason: 'OVERSOLD' | 'PAYMENT_FAILED' | etc.
};

await BookingEvent.create(bookingEvent);
```
Benefits:
- Complete audit trail for disputes
- Can rebuild state from events
- Complies with regulatory requirements

##### 4. **Distributed Transaction Support (MongoDB 4.0+)**
For operations spanning multiple collections or documents:
```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Decrement event seats
  await Event.findOneAndUpdate({ _id: eventId }, { $inc: { remaining: -qty } }, { session });
  
  // Create booking record
  await Booking.create([{ eventId, qty }], { session });
  
  // Deduct payment
  await Payment.findOneAndUpdate({ userId }, { $inc: { balance: -price } }, { session });
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
}
```

##### 5. **Rate Limiting & Fraud Detection**
```javascript
// Prevent one user from booking all seats
const userBookingsToday = await Booking.countDocuments({
  userId: req.user.id,
  createdAt: { $gte: startOfDay }
});

if (userBookingsToday > MAX_BOOKINGS_PER_USER) {
  throw new Error('Booking limit exceeded');
}

// Flag suspicious patterns
if (qty > UNUSUAL_QUANTITY) {
  await suspiciousBooking.save();  // Alert fraud team
}
```

##### 6. **Queue-Based Booking (For High Traffic)**
For events with extreme demand (e.g., Taylor Swift concert):
```javascript
// Instead of immediate booking, add to queue
await BookingQueue.create({
  userId,
  eventId,
  sectionId,
  qty,
  position: queue.length,
  expiresAt: Date.now() + 15*60*1000  // 15 min to complete
});

// Background worker processes queue in order
// Guarantees fair distribution
```

##### 7. **Caching Layer (Redis)**
```javascript
// Cache remaining seats to reduce DB load
const cacheKey = `event:${eventId}:remaining`;
let remaining = await redis.get(cacheKey);

if (!remaining) {
  const event = await Event.findById(eventId);
  remaining = event.sections[0].remaining;
  await redis.setex(cacheKey, 60, remaining);  // Cache 60s
}

// After booking, invalidate cache
await redis.del(cacheKey);
```

##### 8. **Dead Letter Queue for Failed Bookings**
```javascript
// If booking fails due to system error, queue for retry
try {
  await attemptBooking(eventId, sectionId, qty);
} catch (error) {
  await deadLetterQueue.push({
    eventId,
    sectionId,
    qty,
    error: error.message,
    retries: 0,
    maxRetries: 3
  });
}

// Separate service retries failed bookings
```

##### 9. **Detailed Metrics & Monitoring**
```javascript
// Track conversion rates, bottlenecks
prometheus.histogram('booking_duration_ms', duration);
prometheus.counter('bookings_successful', 1);
prometheus.counter('bookings_failed', 1, { reason: 'OVERSOLD' });

// Alert if overselling is detected
if (finalRemaining < 0) {
  await alertOncall('CRITICAL: Overselling detected!');
}
```

##### 10. **Payment Integration with Idempotency Keys**
```javascript
// Prevent duplicate charges if request is retried
const idempotencyKey = `${userId}:${eventId}:${timestamp}`;
const existingPayment = await Payment.findOne({ idempotencyKey });

if (existingPayment) {
  return existingPayment;  // Idempotent response
}

// Process payment with idempotency key
const payment = await stripe.charges.create({
  idempotency_key: idempotencyKey,
  amount: totalPrice,
  currency: 'usd'
});
```

#### Summary Table: Current vs Production

| Aspect | Current | Production Improvement |
|--------|---------|------------------------|
| **Atomicity** | Single document | Distributed transactions |
| **Seat Holding** | None | 5-15 min reservation hold |
| **Audit** | Booking record only | Event sourcing log |
| **Scale** | <1k req/sec | >10k req/sec with queuing |
| **Fraud** | None | Rate limiting + pattern detection |
| **Payment** | Direct charge | Idempotent with retry logic |
| **Monitoring** | Logs | Metrics + alerting |
| **DR** | Single region | Multi-region failover |
| **Cache** | Database only | Redis layer |
| **Recovery** | Manual | Automatic retry + DLQ |

#### Recommended Implementation Order
1. **Start**: Current setup (production-ready for <1k concurrent users)
2. **Week 1**: Add Redis caching + metrics
3. **Week 2**: Add reservation holds + rate limiting
4. **Week 3**: Add event sourcing for audit trail
5. **Month 2**: Add queue-based booking for peak events
6. **Month 3**: Multi-region setup with failover

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