const Razorpay = require("razorpay");

const razorpayConfigured = !!(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
);

let razorpay = null;
if (razorpayConfigured) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  console.log("✅ Razorpay configured");
} else {
  console.warn(
    "⚠️  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing — owner payment disabled until set in .env",
  );
}

// One-time owner registration fee, in paise. ₹100 = 10000 paise.
// Override by setting REGISTRATION_FEE_PAISE in .env.
const REGISTRATION_FEE_PAISE =
  Number(process.env.REGISTRATION_FEE_PAISE) || 10000;

module.exports = { razorpay, razorpayConfigured, REGISTRATION_FEE_PAISE };
