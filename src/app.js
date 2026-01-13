import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

// Import Routes
import eventRoutes from './routes/eventRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';

// Load env vars
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Middleware
app.use(express.json()); // Body parser for JSON data

// Mount Routes
// 1. Event Routes -> /events/create, /events/:id
app.use('/events', eventRoutes); 

// 2. Booking Routes -> /book, /bookings
// We mount this at the root because the paths are top-level
app.use('/', bookingRoutes); 

// 404 Handler (Optional but good practice)
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

export default app;