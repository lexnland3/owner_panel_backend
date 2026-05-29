const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'Owner',    required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  lastMessage:   { type: String,  default: '' },
  lastMessageAt: { type: Date,    default: Date.now },
  unreadByOwner:    { type: Number, default: 0 },
  unreadByCustomer: { type: Number, default: 0 },
}, { timestamps: true });

// One chat per customer-owner-property combination
ChatSchema.index({ customer: 1, owner: 1, property: 1 }, { unique: true });

module.exports = mongoose.model('Chat', ChatSchema);
