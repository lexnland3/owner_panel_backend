const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');

router.use(protect);

// Stub — replace with full implementation when Message model is ready
router.get('/',  (req, res) => res.json({ success: true, chats: [] }));

module.exports = router;
