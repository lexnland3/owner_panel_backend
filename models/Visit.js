const mongoose = require("mongoose");

const ProposalSchema = new mongoose.Schema(
  {
    by: { type: String, enum: ["owner", "customer"], required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const VisitSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    visitorName: { type: String, required: true, trim: true },
    visitorPhone: { type: String, required: true, trim: true },
    visitorEmail: { type: String, default: "" },
    // visitDate/visitTime always hold the CURRENT proposed (or agreed) slot.
    visitDate: { type: Date, required: true },
    visitTime: { type: String, required: true },
    requirement: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "rescheduled"],
      default: "pending",
    },
    // ── Negotiation state ──────────────────────────────────────
    // awaitingFrom: whose turn it is to respond ('owner' | 'customer' | null when settled)
    awaitingFrom: {
      type: String,
      enum: ["owner", "customer", null],
      default: "owner",
    },
    // proposedBy: who made the latest proposal that's currently on the table
    proposedBy: {
      type: String,
      enum: ["owner", "customer"],
      default: "customer",
    },
    // proposals: the full back-and-forth history (shown as a thread in both apps)
    proposals: { type: [ProposalSchema], default: [] },

    ownerNote: { type: String, default: "" },
    // kept for backward compatibility with older clients
    rescheduleDate: { type: Date, default: null },
    rescheduleTime: { type: String, default: "" },
    rescheduleReason: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Visit", VisitSchema);
