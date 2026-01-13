import express from 'express';
import { createBooking, listBookings } from '../controllers/bookingController.js';

const router = express.Router();

router.post('/book', createBooking);
router.get('/bookings', listBookings);

export default router;