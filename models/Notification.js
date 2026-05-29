const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    owner:   { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    type:    { type: String, enum: ['listing', 'visit', 'system', 'message', 'admin_review'], default: 'system' },
    forAdmin:{ type: Boolean, default: false },  // true = this notification is for admin panel
    isRead:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);
