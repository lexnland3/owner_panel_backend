const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    senderType: { type: String, enum: ["customer", "owner"], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, default: "" },
    imageUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    audioDuration: { type: Number, default: 0 },
    linkUrl: { type: String, default: null },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: "" },
    // Edit support
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    // Delete support
    deletedForSender: { type: Boolean, default: false }, // "delete for me"
    deletedForEveryone: { type: Boolean, default: false }, // "delete for everyone" — shows "Message deleted"
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", MessageSchema);
