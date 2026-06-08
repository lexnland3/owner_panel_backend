const express        = require('express');
const router         = express.Router();
const SupportTicket  = require('../models/SupportTicket');
const { protect }    = require('../middleware/auth');
const { sendOTPEmail } = require('../config/email');

// ── Helper: get customer model safely ────────────────────────
const getCustomer = () => {
  try { return require('mongoose').model('Customer'); } catch (_) { return null; }
};

// ── Helper: send confirmation email to user ───────────────────
async function sendConfirmation(email, name, subject) {
  try {
    const { transporter } = require('../config/email');
    // Use the existing email config
    const nodemailer   = require('nodemailer');
    const transObj     = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST,
      port:   Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transObj.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      email,
      subject: '✅ Support Request Received — LexNLand',
      text:    `Hi ${name},\n\nWe have received your support request:\n"${subject}"\n\nOur team will review it and reply to this email shortly.\n\nThank you for reaching out.\n\n– LexNLand Support Team`,
      html:    `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#B05A38">LexNLand Support</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>We have received your support request:</p>
        <blockquote style="background:#f9f9f9;border-left:4px solid #B05A38;padding:12px 16px;margin:12px 0;border-radius:4px">
          <strong>${subject}</strong>
        </blockquote>
        <p>Our team will review it and <strong>reply to this email</strong> shortly.</p>
        <p style="color:#888;font-size:13px">Thank you for reaching out.<br/>– LexNLand Support Team</p>
      </div>`,
    });
  } catch (e) { console.error('Confirmation email error:', e.message); }
}

// ── POST /api/support/customer — customer submits a ticket ────
router.post('/customer', async (req, res, next) => {
  try {
    const Customer = getCustomer();
    // Verify customer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Authentication required' });

    const jwt = require('jsonwebtoken');
    let decoded;
    try { decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET); }
    catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }

    if (decoded.type !== 'customer')
      return res.status(403).json({ success: false, message: 'Customer access only' });

    const customer = Customer ? await Customer.findById(decoded.id) : null;
    if (!customer)
      return res.status(404).json({ success: false, message: 'Customer not found' });

    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim())
      return res.status(400).json({ success: false, message: 'Subject and message are required' });

    const ticket = await SupportTicket.create({
      userId:   customer._id,
      userType: 'customer',
      name:     customer.name,
      email:    customer.email,
      subject:  subject.trim(),
      message:  message.trim(),
    });

    // Send confirmation email
    await sendConfirmation(customer.email, customer.name, subject.trim());

    res.status(201).json({ success: true, message: 'Support request submitted', ticket });
  } catch (err) { next(err); }
});

// ── POST /api/support/owner — owner submits a ticket ──────────
router.post('/owner', protect, async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim())
      return res.status(400).json({ success: false, message: 'Subject and message are required' });

    const ticket = await SupportTicket.create({
      userId:   req.owner._id,
      userType: 'owner',
      name:     req.owner.name,
      email:    req.owner.email,
      subject:  subject.trim(),
      message:  message.trim(),
    });

    await sendConfirmation(req.owner.email, req.owner.name, subject.trim());

    res.status(201).json({ success: true, message: 'Support request submitted', ticket });
  } catch (err) { next(err); }
});

module.exports = router;
