const express      = require('express');
const router       = express.Router();
const Property     = require('../models/Property');
const Owner        = require('../models/Owner');
const Notification = require('../models/Notification');
const Chat         = require('../models/Chat');
const Message      = require('../models/Message');
const Visit        = require('../models/Visit');

// ── Customer model (defined inline in customers.js, so we grab it lazily) ──
const getCustomer = () => {
  try { return require('mongoose').model('Customer'); } catch (_) { return null; }
};

// ── Admin auth middleware ─────────────────────────────────────
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// ── POST /api/admin/login  (public) ──────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Safety check — if admin env vars are missing, give a clear error
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    console.error('❌ ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SECRET are missing from .env');
    return res.status(500).json({
      success: false,
      message: 'Admin credentials not configured. Add ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SECRET to .env',
    });
  }

  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = password === process.env.ADMIN_PASSWORD;

  if (validUser && validPass) {
    console.log(`✅ Admin login successful: ${username}`);
    return res.json({ success: true, token: process.env.ADMIN_SECRET, username });
  }

  console.warn(`⚠️  Failed admin login attempt — username: "${username}"`);
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

router.use(adminAuth);

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalProperties, active, underReview, inactive, rejected, suspended,
      verified, totalOwners, pgCount, guestCount, plotCount,
    ] = await Promise.all([
      Property.countDocuments(),
      Property.countDocuments({ status: 'active' }),
      Property.countDocuments({ status: 'under_review' }),
      Property.countDocuments({ status: 'inactive' }),
      Property.countDocuments({ status: 'rejected' }),
      Property.countDocuments({ status: 'suspended' }),
      Property.countDocuments({ isVerified: true }),
      Owner.countDocuments(),
      Property.countDocuments({ propertyType: 'pg' }),
      Property.countDocuments({ propertyType: 'guest' }),
      Property.countDocuments({ propertyType: 'plot' }),
    ]);

    const Customer = getCustomer();
    const [totalVisits, totalCustomers, totalChats] = await Promise.all([
      Visit.countDocuments().catch(() => 0),
      Customer ? Customer.countDocuments() : Promise.resolve(0),
      Chat.countDocuments().catch(() => 0),
    ]);

    res.json({
      success: true,
      stats: {
        totalProperties, totalOwners, totalVisits, totalCustomers, totalChats,
        byStatus: { active, under_review: underReview, inactive, rejected, suspended },
        byType:   { pg: pgCount, guest: guestCount, plot: plotCount },
        verification: { verified, pending: totalProperties - verified },
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/properties ─────────────────────────────────
router.get('/properties', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) { filter.status       = req.query.status; }
    if (req.query.type)   { filter.propertyType = req.query.type;   }
    if (req.query.search) {
      filter.$or = [
        { propertyName: { $regex: req.query.search, $options: 'i' } },
        { location:     { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const skip  = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate('owner', 'name email phone accountStatus isAadhaarVerified createdAt')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit),
      Property.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), properties });
  } catch (err) { next(err); }
});

// ── GET /api/admin/properties/:id  (full detail) ─────────────
router.get('/properties/:id', async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('owner', 'name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto');
    if (!property)
      return res.status(404).json({ success: false, message: 'Property not found' });
    res.json({ success: true, property });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/properties/:id/verify ───────────────────
// Verify ✅  or  Reject ❌
router.patch('/properties/:id/verify', async (req, res, next) => {
  try {
    const { isVerified, status, rejectionNote } = req.body;
    const allowed = ['active', 'rejected', 'under_review', 'inactive', 'suspended'];
    if (status && !allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const update = {};
    if (typeof isVerified === 'boolean') { update.isVerified    = isVerified; }
    if (status)                          { update.status        = status; }
    if (rejectionNote !== undefined)     { update.rejectionNote = rejectionNote; }

    const property = await Property.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('owner', 'name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto');

    if (!property)
      return res.status(404).json({ success: false, message: 'Property not found' });

    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      if (isVerified === true) {
        await Notification.create({
          owner:   ownerId,
          title:   'Property Verified! ✅',
          message: `"${property.propertyName}" has been legally verified and is now live on the platform.`,
          type:    'listing',
        });
      } else if (status === 'rejected') {
        await Notification.create({
          owner:   ownerId,
          title:   'Property Rejected ❌',
          message: `"${property.propertyName}" was rejected by admin. ${rejectionNote ? 'Reason: ' + rejectionNote : 'Please contact support for details.'}`,
          type:    'listing',
        });
      }
    }

    res.json({ success: true, message: `Property updated`, property });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/properties/:id/suspend ──────────────────
// Suspend a property and notify the owner with reason
router.patch('/properties/:id/suspend', async (req, res, next) => {
  try {
    const { suspensionReason } = req.body;
    if (!suspensionReason || !suspensionReason.trim()) {
      return res.status(400).json({ success: false, message: 'Suspension reason is required' });
    }

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        status:          'suspended',
        isVerified:      false,
        rejectionNote:   suspensionReason.trim(),
      },
      { new: true }
    ).populate('owner', 'name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto');

    if (!property)
      return res.status(404).json({ success: false, message: 'Property not found' });

    // ✅ Notify owner immediately with the suspension reason
    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      await Notification.create({
        owner:   ownerId,
        title:   '⚠️ Property Suspended',
        message: `Your property "${property.propertyName}" has been suspended by the admin.\n\nReason: ${suspensionReason.trim()}\n\nPlease contact support or make the necessary changes and resubmit.`,
        type:    'listing',
      });
    }

    res.json({
      success:  true,
      message:  'Property suspended and owner notified',
      property,
    });
  } catch (err) { next(err); }
});


// ── PATCH /api/admin/properties/:id/reinstate ─────────────────
// Reinstate a suspended/rejected property back to under_review
// so the owner can fix issues and resubmit
router.patch('/properties/:id/reinstate', async (req, res, next) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        status:        'under_review',
        isVerified:    false,
        rejectionNote: '',
      },
      { new: true }
    ).populate('owner', 'name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto');

    if (!property)
      return res.status(404).json({ success: false, message: 'Property not found' });

    // Notify owner
    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      await Notification.create({
        owner:   ownerId,
        title:   '🔄 Property Reinstated',
        message: `Your property "${property.propertyName}" has been reinstated by the admin and is back under review. You may now update your details, photos, or documents and resubmit.`,
        type:    'listing',
      });
    }

    res.json({
      success:  true,
      message:  'Property reinstated — owner notified',
      property,
    });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/properties/:id ─────────────────────────
router.delete('/properties/:id', async (req, res, next) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property)
      return res.status(404).json({ success: false, message: 'Property not found' });

    // Notify owner
    const ownerId = property.owner;
    if (ownerId) {
      await Notification.create({
        owner:   ownerId,
        title:   '🗑️ Property Removed',
        message: `Your property "${property.propertyName}" has been permanently removed from the platform by the admin.`,
        type:    'listing',
      });
    }

    res.json({ success: true, message: 'Property deleted and owner notified' });
  } catch (err) { next(err); }
});


// ── GET /api/admin/review-alerts ─────────────────────────────
// Properties where suspended/rejected owner has uploaded new files
// Admin needs to re-review these
router.get('/review-alerts', async (req, res, next) => {
  try {
    const alerts = await Property.find({ pendingAdminReview: true })
      .populate('owner', 'name email phone')
      .sort({ lastOwnerUpdateAt: -1 });

    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/properties/:id/clear-review ─────────────
// Mark pendingAdminReview as false after admin has reviewed
router.patch('/properties/:id/clear-review', async (req, res, next) => {
  try {
    await Property.findByIdAndUpdate(req.params.id, { pendingAdminReview: false });
    res.json({ success: true, message: 'Review flag cleared' });
  } catch (err) { next(err); }
});

// ── GET /api/admin/owners ─────────────────────────────────────
router.get('/owners', async (req, res, next) => {
  try {
    // Attach property count to each owner
    const owners = await Owner.find().sort({ createdAt: -1 }).lean();
    const counts = await Property.aggregate([
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    const enriched = owners.map(o => ({
      ...o,
      propertyCount: countMap[o._id.toString()] || 0,
    }));
    res.json({ success: true, count: enriched.length, owners: enriched });
  } catch (err) { next(err); }
});

// ── GET /api/admin/visits ─────────────────────────────────────
router.get('/visits', async (req, res, next) => {
  try {
    const { status, search, page: pg, limit: lim } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { visitorName:  { $regex: search, $options: 'i' } },
        { visitorPhone: { $regex: search, $options: 'i' } },
      ];
    }
    const page  = Math.max(1, parseInt(pg)  || 1);
    const limit = Math.min(100, parseInt(lim) || 30);
    const skip  = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      Visit.find(filter)
        .populate('property', 'propertyName location propertyType')
        .populate('owner', 'name email')
        .sort({ visitDate: -1 })
        .skip(skip).limit(limit),
      Visit.countDocuments(filter),
    ]);
    res.json({ success: true, count: total, page, pages: Math.ceil(total / limit), visits });
  } catch (err) { next(err); }
});

// ── GET /api/admin/customers ─────────────────────────────────
router.get('/customers', async (req, res, next) => {
  try {
    const Customer = getCustomer();
    if (!Customer) return res.json({ success: true, customers: [], count: 0 });

    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 }).lean();

    // Enrich with visit count, favourite count, chat count
    const ids = customers.map(c => c._id);
    const [visitCounts, chatCounts, favCounts] = await Promise.all([
      Visit.aggregate([{ $match: { customer: { $in: ids } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]),
      Chat.aggregate([{ $match: { customer: { $in: ids } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]),
      require('../models/Favourite').aggregate([{ $match: { customer: { $in: ids } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]).catch(() => []),
    ]);

    const vm = {}, cm = {}, fm = {};
    visitCounts.forEach(x => vm[x._id] = x.count);
    chatCounts.forEach(x  => cm[x._id] = x.count);
    favCounts.forEach(x   => fm[x._id] = x.count);

    const enriched = customers.map(c => ({
      ...c,
      visitCount:    vm[c._id] || 0,
      chatCount:     cm[c._id] || 0,
      favouriteCount:fm[c._id] || 0,
    }));

    res.json({ success: true, count: enriched.length, customers: enriched });
  } catch (err) { next(err); }
});

// ── GET /api/admin/customers/:id ──────────────────────────────
router.get('/customers/:id', async (req, res, next) => {
  try {
    const Customer = getCustomer();
    if (!Customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const visits = await Visit.find({ customer: customer._id })
        .populate('property', 'propertyName location propertyType')
        .populate('owner', 'name email')
        .sort({ createdAt: -1 }).limit(20);

    res.json({ success: true, customer, visits });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/customers/:id ───────────────────────────
router.delete('/customers/:id', async (req, res, next) => {
  try {
    const Customer = getCustomer();
    if (!Customer) return res.status(404).json({ success: false, message: 'Not found' });
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) { next(err); }
});

module.exports = router;