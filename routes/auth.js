const express = require('express');
const router  = express.Router();
const {
  register, login, googleAuth,
  verifyEmailOTP, resendOTP,
  forgotPassword, verifyResetOTP, resetPassword,
  getMe, updateProfile, changePassword, verifyAadhaar,
  uploadElectricityBill,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register',          register);
router.post('/login',             login);
router.post('/google',            googleAuth);
router.post('/verify-email-otp',  verifyEmailOTP);
router.post('/resend-otp',        resendOTP);
router.post('/forgot-password',   forgotPassword);
router.post('/verify-reset-otp',  verifyResetOTP);
router.post('/reset-password',    resetPassword);
router.get('/me',                 protect, getMe);
router.put('/profile',            protect, updateProfile);
router.put('/change-password',    protect, changePassword);
router.post('/verify-aadhaar',    protect, verifyAadhaar);
router.post('/electricity-bill',  protect, uploadElectricityBill);

module.exports = router;
