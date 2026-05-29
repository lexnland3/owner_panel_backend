const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  chat:          { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  senderType:    { type: String, enum: ['customer', 'owner'], required: true },
  senderId:      { type: mongoose.Schema.Types.ObjectId, required: true },
  messageType:   { type: String, enum: ['text', 'image', 'visit_card', 'audio'], default: 'text' },
  text:          { type: String, default: '' },
  imageUrl:      { type: String, default: null },
  audioUrl:      { type: String, default: null },
  linkUrl:       { type: String, default: null },
  // Visit card — embedded when a visit is booked or a change is requested via chat
  visitCard: {
    visitId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    cardType:      { type: String, enum: ['booked', 'change_request', 'confirmed', 'cancelled'], default: 'booked' },
    propertyName:  { type: String, default: '' },
    visitorName:   { type: String, default: '' },
    visitDate:     { type: Date,   default: null },
    visitTime:     { type: String, default: '' },
    requirement:   { type: String, default: '' },
    requestedDate: { type: Date,   default: null },  // for change_request
    requestedTime: { type: String, default: '' },    // for change_request
    reason:        { type: String, default: '' },    // for change_request
  },
  isBlocked:     { type: Boolean, default: false },
  blockedReason: { type: String, default: '' },
  // Edit support
  isEdited:      { type: Boolean, default: false },
  editedAt:      { type: Date,    default: null },
  // Delete support
  deletedForSender:   { type: Boolean, default: false },  // "delete for me"
  deletedForEveryone: { type: Boolean, default: false },  // "delete for everyone" — shows "Message deleted"
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
