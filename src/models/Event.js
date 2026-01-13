import mongoose from "mongoose";

export const sectionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  capacity: { 
    type: Number, 
    required: true,
    min: 1
  },
  remaining: { 
    type: Number, 
    required: true 
  }
});

export const eventSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  sections: [sectionSchema] 
}, {
  timestamps: true
});

const Event = mongoose.model('Event', eventSchema);
export default Event;