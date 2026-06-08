const express      = require('express');
const router       = express.Router();
const Visit        = require('../models/Visit');
const Property     = require('../models/Property');
const Notification = require('../models/Notification');
const { protect }  = require('../middleware/auth');

router.use(protect);

// GET /api/visits
router.get('/', async (req, res, next) => {
  try {
    const ownerProperties = await Property.find({ owner: req.owner._id }).select('_id');
    const propertyIds = ownerProperties.map(p => p._id);
    const filter = { property: { $in: propertyIds } };
    if (req.query.status) filter.status = req.query.status;
    const visits = await Visit.find(filter)
      .populate('property', 'propertyName location propertyType photos')
      .populate('customer', 'name email phone')
      .sort({ visitDate: 1, createdAt: -1 });
    res.json({ success: true, count: visits.length, visits });
  } catch (err) { next(err); }
});

// GET /api/visits/:id
router.get('/:id', async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate('property', 'propertyName location propertyType photos')
      .populate('customer', 'name email phone');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/confirm
router.patch('/:id/confirm', async (req, res, next) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', ownerNote: req.body.ownerNote || '' },
      { new: true }
    ).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    // Notify customer if registered
    if (visit.customer) {
      // Could notify via push/email — skip for now
    }
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/cancel
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', ownerNote: req.body.reason || '' },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/complete
router.patch('/:id/complete', async (req, res, next) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id, { status: 'completed' }, { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/reschedule
router.patch('/:id/reschedule', async (req, res, next) => {
  try {
    const { newDate, newTime, reason } = req.body;
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rescheduled',
        rescheduleDate:   newDate,
        rescheduleTime:   newTime,
        rescheduleReason: reason || '',
      },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

module.exports = router;
