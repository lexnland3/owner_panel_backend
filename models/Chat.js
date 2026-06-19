const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },
    // Most-recent plot this conversation is about. Kept only for showing context
    // in the chat list / header — it is NOT part of the uniqueness key anymore,
    // so one owner = one thread no matter how many plots are discussed.
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    unreadByOwner: { type: Number, default: 0 },
    unreadByCustomer: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// One chat per customer-owner pair (regardless of which plot).
ChatSchema.index({ customer: 1, owner: 1 }, { unique: true });

module.exports = mongoose.model("Chat", ChatSchema);
