const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const OwnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, default: "" },
    password: { type: String, select: false },
    authMethod: { type: String, enum: ["email", "google"], default: "email" },
    googleId: { type: String, default: null },
    profilePhoto: { type: String, default: null },

    // Owner onboarding details
    businessName: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    idNumber: { type: String, default: "" }, // Aadhaar / PAN
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    occupation: { type: String, default: "" }, // occupation / business type
    altPhone: { type: String, default: "" }, // alternate / WhatsApp number
    gstNumber: { type: String, default: "" }, // optional, businesses only

    // Registration payment
    isPaid: { type: Boolean, default: false },
    paymentId: { type: String, default: null },
    paymentOrderId: { type: String, default: null },

    isEmailVerified: { type: Boolean, default: false },
    isAadhaarVerified: { type: Boolean, default: false },
    isElectricityUploaded: { type: Boolean, default: false },

    accountStatus: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
    },

    // OTP
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    otpType: { type: String, select: false }, // 'verify' | 'reset'
  },
  { timestamps: true },
);

// Hash password before save
OwnerSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

OwnerSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

OwnerSchema.methods.generateOTP = function (type) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  this.otpType = type;
  return otp;
};

OwnerSchema.methods.verifyOTP = function (otp, type) {
  if (this.otpType !== type) return { valid: false, msg: "Invalid OTP type" };
  if (new Date() > this.otpExpiry)
    return { valid: false, msg: "OTP has expired. Request a new one." };
  if (this.otp !== otp) return { valid: false, msg: "Incorrect OTP" };
  return { valid: true };
};

module.exports = mongoose.model("Owner", OwnerSchema);
