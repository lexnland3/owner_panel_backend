const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["customer", "owner"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
