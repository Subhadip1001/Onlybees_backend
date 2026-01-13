import Event from '../models/Event.js';

export const createEvent = async (req, res) => {
  try {
    const { name, sections } = req.body;

    if (!name || !sections || sections.length === 0) {
      return res.status(400).json({ error: 'Name and at least one section are required' });
    }

    const sectionsWithRemaining = sections.map(section => ({
      ...section,
      remaining: section.remaining !== undefined ? section.remaining : section.capacity
    }));

    const event = new Event({
      name,
      sections: sectionsWithRemaining
    });

    const savedEvent = await event.save();
    
    res.status(201).json(savedEvent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};