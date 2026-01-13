import Event from '../models/Event.js';
import Booking from '../models/Booking.js';

export const bookTicket = async (eventId, sectionId, qty) => {
  try {
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        'sections._id': sectionId,
        'sections.remaining': { $gte: qty }
      },
      {
        $inc: { 'sections.$.remaining': -qty }
      },
      { 
        new: true 
      }
    );

    if (!updatedEvent) {
      throw new Error('Not enough seats available');
    }

    const booking = new Booking({
      eventId,
      sectionId,
      qty
    });

    await booking.save();
    
    return booking;

  } catch (error) {
    throw error;
  }
};

export const getAllBookings = async () => {
  return await Booking.find()
    .populate('eventId', 'name')
    .sort({ createdAt: -1 });
};