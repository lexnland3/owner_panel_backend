const express = require('express');
const router  = express.Router();
const {
  register, login, googleAuth,
  verifyEmailOTP, resendOTP,
  forgotPassword, verifyResetOTP, resetPassword,
  getMe, updateProfile, changePassword, verifyAadhaar,
  uploadElectricityBill,
} = require('../controllers/authController');
const { uploadDocuments: uploadDocs } = require('../config/cloudinary');
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


// ── POST /api/auth/upload-aadhaar  (owner Aadhaar verification) ──
router.post('/upload-aadhaar',
  protect,
  uploadDocs.fields([
    { name: 'aadhaarFront', maxCount: 1 },
    { name: 'aadhaarBack',  maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const { fileToUrl } = require('../config/cloudinary');
      const updates = {};
      if (req.files?.aadhaarFront) updates.aadhaarFront = fileToUrl(req.files.aadhaarFront[0]);
      if (req.files?.aadhaarBack)  updates.aadhaarBack  = fileToUrl(req.files.aadhaarBack[0]);
      if (!Object.keys(updates).length)
        return res.status(400).json({ success: false, message: 'No files uploaded' });
      updates.isAadhaarVerified = true;
      const Owner = require('../models/Owner');
      const owner = await Owner.findByIdAndUpdate(req.owner._id, updates, { new: true });
      res.json({ success: true, message: 'Aadhaar uploaded successfully', owner });
    } catch (err) { next(err); }
  }
);

module.exports = router;
