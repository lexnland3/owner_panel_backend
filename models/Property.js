const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },
    propertyType: {
      type: String,
      enum: ["pg", "guest", "plot"],
      required: true,
    },
    propertyName: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    localLandmark: { type: String, default: "" },
    mapLink: { type: String, default: "" }, // Google Maps URL

    // ── Status & Verification ─────────────────────────────
    status: {
      type: String,
      enum: ["under_review", "active", "inactive", "rejected", "suspended"],
      default: "under_review",
    },
    // ✅ isVerified and rejectionNote — were missing before
    isVerified: { type: Boolean, default: false },
    rejectionNote: { type: String, default: "" },
    // ✅ Set to true when owner updates a suspended/rejected property — triggers admin re-review
    pendingAdminReview: { type: Boolean, default: false },
    lastOwnerUpdateAt: { type: Date, default: null },

    // ── Ratings (computed from Rating collection) ─────────
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // ── Media ─────────────────────────────────────────────
    photos: [{ type: String }],
    registryDocument: { type: String, default: null },
    nocDocument: { type: String, default: null },
    idProofType: { type: String, enum: ["aadhaar", "pan", ""], default: "" },
    idProofFront: { type: String, default: null },
    idProofBack: { type: String, default: null },

    // ── Type-specific details ─────────────────────────────
    pgDetails: {
      availableFor: [String],
      totalRooms: { type: Number, default: 0 },
      acRooms: { type: Number, default: 0 },
      nonAcRooms: { type: Number, default: 0 },
      occupancyType: { type: String, default: "any" },
      roomType: { type: String, default: "sharing" },
      sharingPricing: {
        singleRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        doubleRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        tripleRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
      },
      groupPricing: {
        twoPersons: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        threePersons: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        fourPersons: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
      },
      facilities: [String],
      commonKitchen: { type: Boolean, default: false },
      privateKitchen: { type: Boolean, default: false },
      description: { type: String, default: "" },
    },

    guestRoomDetails: {
      totalRooms: { type: Number, default: 0 },
      acRooms: { type: Number, default: 0 },
      nonAcRooms: { type: Number, default: 0 },
      pricing: {
        singleRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        doubleRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
        familyRoom: {
          price: { type: Number, default: 0 },
          deposit: { type: Number, default: 0 },
        },
      },
      facilities: [String],
      commonKitchen: { type: Boolean, default: false },
      privateKitchen: { type: Boolean, default: false },
      description: { type: String, default: "" },
    },

    plotDetails: {
      plotId: { type: String, default: null },
      plotType: { type: String, default: null },
      facing: { type: String, default: null },
      plotSize: { type: Number, default: 0 },
      plotDimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
      },
      totalPrice: { type: Number, default: 0 },
      pricePerSqft: { type: Number, default: 0 },
      ownershipType: { type: String, default: null },
      facilities: [String],
      description: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Property", PropertySchema);
