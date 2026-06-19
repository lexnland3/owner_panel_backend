const mongoose = require("mongoose");

// One rating per customer per property (they can update their own).
const RatingSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    rating: { type: Number, min: 1, max: 5, required: true },
  },
  { timestamps: true },
);

RatingSchema.index({ property: 1, customer: 1 }, { unique: true });

module.exports =
  mongoose.models.Rating || mongoose.model("Rating", RatingSchema);
