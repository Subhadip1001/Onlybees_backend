import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  qty: {
    type: Number,
    required: true,
    min: 1
  }
}, {
  timestamps: true
});

bookingSchema.index({ eventId: 1 });

export default mongoose.model('Booking', bookingSchema);