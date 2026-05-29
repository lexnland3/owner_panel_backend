const express      = require('express');
const router       = express.Router();
const Notification = require('../models/Notification');
const { protect }  = require('../middleware/auth');

router.use(protect);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ owner: req.owner._id }).sort({ createdAt: -1 });
    const unreadCount   = notifications.filter(n => !n.isRead).length;
    res.json({ success: true, count: notifications.length, unreadCount, notifications });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ owner: req.owner._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/clear
router.delete('/clear', async (req, res, next) => {
  try {
    await Notification.deleteMany({ owner: req.owner._id });
    res.json({ success: true, message: 'Notifications cleared' });
  } catch (err) { next(err); }
});

module.exports = router;
