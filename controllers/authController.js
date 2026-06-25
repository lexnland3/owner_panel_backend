const Owner = require("../models/Owner");
const Notification = require("../models/Notification");
const crypto = require("crypto");
const {
  razorpay,
  razorpayConfigured,
  REGISTRATION_FEE_PAISE,
} = require("../config/razorpay");
const { sendTokenResponse } = require("../utils/token");
const { sendOTPEmail } = require("../config/email");
const { verifyFirebaseToken } = require("../config/firebase");

// ── Welcome notification ────────────────────────────────────
const createWelcomeNotif = async (ownerId, name) => {
  try {
    await Notification.create({
      owner: ownerId,
      title: "Welcome to LexNLand! 🏠",
      message: `Hi ${name}! Complete your profile and upload your first property.`,
      type: "system",
    });
  } catch (_) {}
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/google  ← Firebase ID token from Flutter
// ────────────────────────────────────────────────────────────
exports.googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res
        .status(400)
        .json({ success: false, message: "Firebase ID token is required" });

    // Verify token with Firebase Admin SDK
    const result = await verifyFirebaseToken(idToken);
    if (!result.valid)
      return res.status(401).json({
        success: false,
        message: `Invalid Firebase token: ${result.error}`,
      });

    const { uid, email, name, picture } = result.decoded;

    if (!email)
      return res.status(400).json({
        success: false,
        message: "Could not get email from Google account",
      });

    // Find existing or create new owner
    let owner = await Owner.findOne({ $or: [{ googleId: uid }, { email }] });

    if (!owner) {
      // New user — create account
      owner = await Owner.create({
        name: name || email.split("@")[0],
        email,
        googleId: uid,
        profilePhoto: picture || null,
        authMethod: "google",
        isEmailVerified: true,
        accountStatus: "active",
      });
      await createWelcomeNotif(owner._id, owner.name);
    } else {
      // Existing user — update Google info if needed
      let changed = false;
      if (!owner.googleId) {
        owner.googleId = uid;
        changed = true;
      }
      if (!owner.profilePhoto) {
        owner.profilePhoto = picture;
        changed = true;
      }
      if (!owner.isEmailVerified) {
        owner.isEmailVerified = true;
        changed = true;
      }
      if (owner.accountStatus === "pending") {
        owner.accountStatus = "active";
        changed = true;
      }
      if (changed) await owner.save({ validateBeforeSave: false });
    }

    sendTokenResponse(owner, 200, res);
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/profile-status
// Verifies the Firebase token and reports which profiles already exist
// for this Google account — WITHOUT creating either. Used to decide where
// to route the user after login (customer panel / owner panel / ask).
// ────────────────────────────────────────────────────────────
exports.profileStatus = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res
        .status(400)
        .json({ success: false, message: "idToken is required" });

    const result = await verifyFirebaseToken(idToken);
    if (!result.valid)
      return res.status(401).json({
        success: false,
        message: `Invalid Firebase token: ${result.error}`,
      });

    const { uid, email } = result.decoded;
    if (!email)
      return res.status(400).json({
        success: false,
        message: "Could not get email from Google account",
      });

    const mongoose = require("mongoose");
    let Customer = null;
    try {
      Customer = mongoose.model("Customer");
    } catch (_) {
      Customer = null;
    }

    const owner = await Owner.findOne({
      $or: [{ googleId: uid }, { email }],
    }).select("_id");
    const customer = Customer
      ? await Customer.findOne({
          $or: [{ googleId: uid }, { email }],
        }).select("_id")
      : null;

    res.json({
      success: true,
      hasOwner: !!owner,
      hasCustomer: !!customer,
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/register
// ────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password, state, city } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });

    const existing = await Owner.findOne({ email });
    if (existing) {
      if (existing.authMethod === "google")
        return res.status(400).json({
          success: false,
          message:
            "This email is registered with Google. Please use Google sign-in.",
        });
      return res.status(400).json({
        success: false,
        message: "Email already registered. Please sign in.",
      });
    }

    const owner = await Owner.create({
      name,
      email,
      phone: phone || "",
      password,
      authMethod: "email",
      state: state || "",
      city: city || "",
    });

    // Send OTP
    const otp = owner.generateOTP("verify");
    await owner.save({ validateBeforeSave: false });

    let emailSent = false;
    try {
      await sendOTPEmail(email, name, otp, "verify");
      emailSent = true;
    } catch (emailErr) {
      console.error("OTP email failed:", emailErr.message);
    }

    await createWelcomeNotif(owner._id, name);

    res.status(201).json({
      success: true,
      message: emailSent
        ? "Account created! Check your email for the verification OTP."
        : "Account created! (Email not configured — use dev OTP below)",
      requiresVerification: true,
      email,
      devOtp: otp, // Always show in dev — remove in production
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/verify-email-otp
// ────────────────────────────────────────────────────────────
exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });

    const owner = await Owner.findOne({ email }).select(
      "+otp +otpExpiry +otpType",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    const check = owner.verifyOTP(otp, "verify");
    if (!check.valid)
      return res.status(400).json({ success: false, message: check.msg });

    owner.isEmailVerified = true;
    owner.accountStatus = "active";
    owner.otp = undefined;
    owner.otpExpiry = undefined;
    owner.otpType = undefined;
    await owner.save({ validateBeforeSave: false });

    sendTokenResponse(owner, 200, res);
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/resend-otp
// ────────────────────────────────────────────────────────────
exports.resendOTP = async (req, res, next) => {
  try {
    const { email, type = "verify" } = req.body;
    const owner = await Owner.findOne({ email }).select(
      "+otp +otpExpiry +otpType",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    const otp = owner.generateOTP(type);
    await owner.save({ validateBeforeSave: false });

    try {
      await sendOTPEmail(email, owner.name, otp, type);
    } catch (_) {}

    res.json({ success: true, message: "OTP resent", devOtp: otp });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });

    const owner = await Owner.findOne({ email }).select("+password");
    if (!owner)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    if (owner.authMethod === "google")
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google sign-in. Please use the Google button.",
      });

    if (!(await owner.matchPassword(password)))
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    // Not verified yet — resend OTP
    if (!owner.isEmailVerified) {
      const otp = owner.generateOTP("verify");
      await owner.save({ validateBeforeSave: false });
      try {
        await sendOTPEmail(email, owner.name, otp, "verify");
      } catch (_) {}
      return res.status(200).json({
        success: true,
        requiresVerification: true,
        message: "Please verify your email. OTP resent.",
        email,
        devOtp: otp,
      });
    }

    sendTokenResponse(owner, 200, res);
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });

    const owner = await Owner.findOne({ email }).select(
      "+otp +otpExpiry +otpType",
    );
    if (!owner)
      return res.json({
        success: true,
        message: "If this email exists, a reset OTP has been sent.",
      });

    if (owner.authMethod === "google")
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google sign-in. Password reset is not available.",
      });

    const otp = owner.generateOTP("reset");
    await owner.save({ validateBeforeSave: false });

    let emailSent = false;
    try {
      await sendOTPEmail(email, owner.name, otp, "reset");
      emailSent = true;
    } catch (emailErr) {
      console.error("Reset email failed:", emailErr.message);
    }

    res.json({
      success: true,
      message: emailSent
        ? "Password reset OTP sent to your email."
        : "OTP generated (email not configured)",
      devOtp: otp,
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/verify-reset-otp
// ────────────────────────────────────────────────────────────
exports.verifyResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const owner = await Owner.findOne({ email }).select(
      "+otp +otpExpiry +otpType",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    const check = owner.verifyOTP(otp, "reset");
    if (!check.valid)
      return res.status(400).json({ success: false, message: check.msg });

    // Issue a reset token
    const resetToken = require("crypto").randomBytes(32).toString("hex");
    owner.otp = resetToken;
    owner.otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    owner.otpType = "reset";
    await owner.save({ validateBeforeSave: false });

    res.json({ success: true, resetToken, email });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword)
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    if (newPassword.length < 6)
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });

    const owner = await Owner.findOne({ email }).select(
      "+password +otp +otpExpiry",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });
    if (owner.otp !== resetToken || new Date() > owner.otpExpiry)
      return res
        .status(400)
        .json({ success: false, message: "Reset token invalid or expired" });

    owner.password = newPassword;
    owner.otp = undefined;
    owner.otpExpiry = undefined;
    owner.otpType = undefined;
    await owner.save();

    res.json({
      success: true,
      message: "Password reset successfully! Please sign in.",
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.status(200).json({ success: true, owner: req.owner });
};

// ────────────────────────────────────────────────────────────
// PUT /api/auth/profile
// ────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const updates = {};
    const allowed = [
      "name",
      "phone",
      "gender",
      "occupation",
      "businessName",
      "address",
      "city",
      "state",
      "pincode",
      "idNumber",
      "altPhone",
      "gstNumber",
      "profilePhoto",
    ];
    for (const k of allowed)
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    const owner = await Owner.findByIdAndUpdate(req.owner._id, updates, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, owner });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
// PUT /api/auth/change-password
// ────────────────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const owner = await Owner.findById(req.owner._id).select("+password");
    if (!(await owner.matchPassword(currentPassword)))
      return res
        .status(400)
        .json({ success: false, message: "Current password is incorrect" });
    owner.password = newPassword;
    await owner.save();
    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

exports.verifyAadhaar = async (req, res, next) => {
  try {
    const owner = await Owner.findByIdAndUpdate(
      req.owner._id,
      { isAadhaarVerified: true },
      { new: true },
    );
    res.status(200).json({ success: true, owner });
  } catch (err) {
    next(err);
  }
};

exports.uploadElectricityBill = async (req, res, next) => {
  try {
    const owner = await Owner.findByIdAndUpdate(
      req.owner._id,
      { isElectricityUploaded: true },
      { new: true },
    );
    res.status(200).json({ success: true, owner });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════
//  OWNER ONBOARDING  +  REGISTRATION PAYMENT
// ════════════════════════════════════════════════════════════

// PATCH /api/auth/owner-details — save the basic onboarding details
exports.saveOwnerDetails = async (req, res, next) => {
  try {
    const { businessName, address, city, state, pincode, idNumber } = req.body;
    const o = req.owner;
    if (businessName !== undefined) o.businessName = businessName;
    if (address !== undefined) o.address = address;
    if (city !== undefined) o.city = city;
    if (state !== undefined) o.state = state;
    if (pincode !== undefined) o.pincode = pincode;
    if (idNumber !== undefined) o.idNumber = idNumber;
    await o.save({ validateBeforeSave: false });
    res.json({ success: true, message: "Details saved" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/payment/create-order — create a Razorpay order for the fee
// POST /api/auth/payment/create-link — create a Razorpay Payment Link
exports.createPaymentLink = async (req, res, next) => {
  try {
    if (!razorpayConfigured)
      return res.status(503).json({
        success: false,
        message: "Payment is not configured yet. Add Razorpay keys to .env.",
      });

    const o = req.owner;
    const link = await razorpay.paymentLink.create({
      amount: REGISTRATION_FEE_PAISE,
      currency: "INR",
      accept_partial: false,
      description: "LexNLand Owner Registration Fee",
      customer: {
        name: o.name || "",
        email: o.email || "",
        contact: o.phone || "",
      },
      notify: { email: !!o.email, sms: false },
      reminder_enable: false,
      notes: { ownerId: o._id.toString(), purpose: "owner_registration" },
    });

    o.paymentOrderId = link.id; // store the payment-link id for status checks
    await o.save({ validateBeforeSave: false });

    res.json({ success: true, url: link.short_url, linkId: link.id });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════
//  RAZORPAY STANDARD CHECKOUT  (order + signature verification)
//  Used by the Owner Panel Flutter app for the one-time ₹100 fee.
// ════════════════════════════════════════════════════════════

// POST /api/auth/payment/create-order — create a Razorpay order for the fee
exports.createPaymentOrder = async (req, res, next) => {
  try {
    if (!razorpayConfigured)
      return res.status(503).json({
        success: false,
        message: "Payment is not configured yet. Add Razorpay keys to .env.",
      });

    const o = req.owner;
    if (o.isPaid)
      return res.json({ success: true, alreadyPaid: true, isPaid: true });

    const amount = REGISTRATION_FEE_PAISE; // paise (₹100 = 10000)
    if (!Number.isInteger(amount) || amount < 100)
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount (min 100 paise)" });

    let order;
    try {
      order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `reg_${Date.now()}`,
        notes: { ownerId: o._id.toString(), purpose: "owner_registration" },
      });
    } catch (rzpErr) {
      console.error("❌ Razorpay order error:", rzpErr.message || rzpErr);
      // 401 from Razorpay = bad keys; everything else = upstream failure
      const status = rzpErr.statusCode === 401 ? 401 : 500;
      return res.status(status).json({
        success: false,
        message:
          status === 401
            ? "Razorpay authentication failed. Check your keys."
            : "Could not create payment order. Please try again.",
      });
    }

    o.paymentOrderId = order.id;
    await o.save({ validateBeforeSave: false });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // publishable key — safe to send to client
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/payment/verify — verify the signature, then mark the owner paid
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res
        .status(400)
        .json({ success: false, message: "Missing payment fields" });

    if (!process.env.RAZORPAY_KEY_SECRET)
      return res
        .status(503)
        .json({ success: false, message: "Payment is not configured." });

    // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(String(razorpay_signature), "utf8");
    const valid =
      expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid)
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });

    const o = req.owner;
    o.isPaid = true;
    o.paymentId = razorpay_payment_id;
    o.paymentOrderId = razorpay_order_id;
    if (o.accountStatus === "pending") o.accountStatus = "active";
    await o.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Payment verified", isPaid: true });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/payment/status — check the link; activate the account when paid
exports.paymentStatus = async (req, res, next) => {
  try {
    const o = req.owner;
    if (o.isPaid) return res.json({ success: true, isPaid: true });
    if (!razorpayConfigured || !o.paymentOrderId)
      return res.json({ success: true, isPaid: false });

    const link = await razorpay.paymentLink.fetch(o.paymentOrderId);
    if (link && link.status === "paid") {
      o.isPaid = true;
      o.paymentId =
        (link.payments && link.payments[0] && link.payments[0].payment_id) ||
        "paid";
      if (o.accountStatus === "pending") o.accountStatus = "active";
      await o.save({ validateBeforeSave: false });
      return res.json({ success: true, isPaid: true });
    }
    res.json({ success: true, isPaid: false });
  } catch (err) {
    next(err);
  }
};
