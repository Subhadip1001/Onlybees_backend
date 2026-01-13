import express from 'express';
import { createEvent, getEvent } from '../controllers/eventController.js';

const router = express.Router();

router.post('/create', createEvent);
router.get('/:id', getEvent);

export default router;