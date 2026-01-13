import * as bookingService from '../services/bookingService.js';

export const createBooking = async (req, res) => {
  try {
    const { eventId, sectionId, qty } = req.body;

    if (!eventId || !sectionId || !qty) {
      return res.status(400).json({ error: 'Missing required fields: eventId, sectionId, qty' });
    }

    if (qty < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const booking = await bookingService.bookTicket(eventId, sectionId, qty);

    res.status(201).json({
      message: 'Booking successful',
      booking
    });

  } catch (error) {
    if (error.message === 'Not enough seats available' || error.message === 'Event or Section not found') {
      return res.status(400).json({ error: error.message });
    }

    console.error('Booking Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


export const listBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getAllBookings();
    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};