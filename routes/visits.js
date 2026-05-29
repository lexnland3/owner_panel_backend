const express      = require('express');
const router       = express.Router();
const Visit        = require('../models/Visit');
const Property     = require('../models/Property');
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
    ).populate('property', 'propertyName');
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

// POST /api/visits — Owner schedules a visit directly
router.post('/', async (req, res, next) => {
  try {
    const { propertyId, visitorName, visitorPhone, visitDate, visitTime, requirement, customerId } = req.body;
    if (!propertyId || !visitorName || !visitorPhone || !visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'propertyId, visitorName, visitorPhone, visitDate, visitTime required' });

    const property = await Property.findOne({ _id: propertyId, owner: req.owner._id });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found or not yours' });

    const visit = await Visit.create({
      property:    propertyId,
      owner:       req.owner._id,
      customer:    customerId || null,
      visitorName,
      visitorPhone,
      visitDate:   new Date(visitDate),
      visitTime,
      requirement: requirement || '',
      status:      'confirmed',   // owner-scheduled visits are auto-confirmed
      scheduledBy: 'owner',
    });

    res.status(201).json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/edit — Owner edits a visit (if owner scheduled, or updating after discussion)
router.patch('/:id/edit', async (req, res, next) => {
  try {
    const { visitDate, visitTime } = req.body;
    if (!visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'visitDate and visitTime required' });

    const visit = await Visit.findById(req.params.id).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    if (['cancelled', 'completed'].includes(visit.status))
      return res.status(400).json({ success: false, message: 'Cannot edit a ' + visit.status + ' visit' });

    visit.visitDate = new Date(visitDate);
    visit.visitTime = visitTime;
    visit.status    = 'pending'; // needs customer to accept
    await visit.save();

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/accept — Owner accepts the customer's edit
router.patch('/:id/accept', async (req, res, next) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed' },
      { new: true }
    ).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/note — Owner sends a note/message about the visit
router.patch('/:id/note', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim())
      return res.status(400).json({ success: false, message: 'Note is required' });

    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { ownerNote: note.trim() },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

module.exports = router;
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
    ).populate('property', 'propertyName');
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

// POST /api/visits — Owner schedules a visit directly
router.post('/', async (req, res, next) => {
  try {
    const { propertyId, visitorName, visitorPhone, visitDate, visitTime, requirement, customerId } = req.body;
    if (!propertyId || !visitorName || !visitorPhone || !visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'propertyId, visitorName, visitorPhone, visitDate, visitTime required' });

    const property = await Property.findOne({ _id: propertyId, owner: req.owner._id });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found or not yours' });

    const visit = await Visit.create({
      property:    propertyId,
      owner:       req.owner._id,
      customer:    customerId || null,
      visitorName,
      visitorPhone,
      visitDate:   new Date(visitDate),
      visitTime,
      requirement: requirement || '',
      status:      'confirmed',   // owner-scheduled visits are auto-confirmed
      scheduledBy: 'owner',
    });

    res.status(201).json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/edit — Owner edits a visit (if owner scheduled, or updating after discussion)
router.patch('/:id/edit', async (req, res, next) => {
  try {
    const { visitDate, visitTime } = req.body;
    if (!visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'visitDate and visitTime required' });

    const visit = await Visit.findById(req.params.id).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    if (['cancelled', 'completed'].includes(visit.status))
      return res.status(400).json({ success: false, message: 'Cannot edit a ' + visit.status + ' visit' });

    visit.visitDate = new Date(visitDate);
    visit.visitTime = visitTime;
    visit.status    = 'pending'; // needs customer to accept
    await visit.save();

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/accept — Owner accepts the customer's edit
router.patch('/:id/accept', async (req, res, next) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed' },
      { new: true }
    ).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /api/visits/:id/note — Owner sends a note/message about the visit
router.patch('/:id/note', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim())
      return res.status(400).json({ success: false, message: 'Note is required' });

    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { ownerNote: note.trim() },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

module.exports = router;
