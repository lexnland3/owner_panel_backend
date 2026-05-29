const mongoose = require('mongoose');

const VisitSchema = new mongoose.Schema({
  property:     { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  owner:        { type: mongoose.Schema.Types.ObjectId, ref: 'Owner',    required: true },
  // customer info (either registered or walk-in)
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  visitorName:  { type: String, required: true, trim: true },
  visitorPhone: { type: String, required: true, trim: true },
  visitorEmail: { type: String, default: '' },
  visitDate:    { type: Date,   required: true },
  visitTime:    { type: String, required: true },
  requirement:  { type: String, default: '' },
  status: {
    type:    String,
    enum:    ['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'],
    default: 'pending',
  },
  scheduledBy: { type: String, enum: ['customer', 'owner'], default: 'customer' },
  ownerNote:       { type: String, default: '' },
  rescheduleDate:  { type: Date,   default: null },
  rescheduleTime:  { type: String, default: '' },
  rescheduleReason:{ type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Visit', VisitSchema);
