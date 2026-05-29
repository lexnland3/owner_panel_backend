const express        = require('express');
const router         = express.Router();
const Property       = require('../models/Property');
const Visit          = require('../models/Visit');
const Chat           = require('../models/Chat');
const Message        = require('../models/Message');
const Notification   = require('../models/Notification');
const Favourite      = require('../models/Favourite');
const { detectPhone} = require('../utils/phoneDetector');
const jwt            = require('jsonwebtoken');
const bcrypt         = require('bcryptjs');
const mongoose       = require('mongoose');

// ── Customer model ────────────────────────────────────────────
let Customer;
try { Customer = mongoose.model('Customer'); } catch (_) {
  const s = new mongoose.Schema({
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    phone:    { type: String, default: '' },
    password: { type: String, select: false },
    googleId: { type: String, default: null },
  }, { timestamps: true });
  s.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
  });
  Customer = mongoose.model('Customer', s);
}


// ── Customer auth middleware ───────────────────────────────────
const customerAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'customer')
      return res.status(403).json({ success: false, message: 'Customer access only' });
    const cust = await Customer.findById(decoded.id);
    if (!cust) return res.status(401).json({ success: false, message: 'Customer not found' });
    req.customerId = decoded.id;
    req.customer   = cust;
    next();
  } catch (_) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};

// ── Owner auth middleware (for owner to reply in chat) ─────────
const ownerAuth = async (req, res, next) => {
  try {
    const Owner = require('../models/Owner');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const owner = await Owner.findById(decoded.id);
    if (!owner) return res.status(401).json({ success: false, message: 'Owner not found' });
    req.ownerId = decoded.id;
    req.owner   = owner;
    next();
  } catch (_) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email and password required' });
    if (await Customer.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email already registered' });
    const customer = await Customer.create({ name, email, phone: phone || '', password });
    const token    = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ success: true, token, customer: { _id: customer._id, name, email, phone } });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const customer = await Customer.findOne({ email }).select('+password');
    if (!customer || !(await bcrypt.compare(password, customer.password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const data  = { _id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    res.json({ success: true, token, customer: data });
  } catch (err) { next(err); }
});

router.get('/me', customerAuth, async (req, res, next) => {
  try {
    res.json({ success: true, customer: req.customer });
  } catch (err) { next(err); }
});

router.post('/google', async (req, res, next) => {
  try {
    const { verifyFirebaseToken } = require('../config/firebase');
    const Owner = require('../models/Owner');
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, message: 'idToken required' });
    const result = await verifyFirebaseToken(idToken);
    if (!result.valid) return res.status(401).json({ success: false, message: `Invalid token: ${result.error}` });
    const { uid, email, name } = result.decoded;
    if (!email) return res.status(400).json({ success: false, message: 'Could not get email from Google' });
    if (await Owner.findOne({ email }))
      return res.status(403).json({ success: false, isOwner: true,
        message: 'This Google account is registered as a property owner. Please use the Owner Panel app.' });
    let customer = await Customer.findOne({ $or: [{ googleId: uid }, { email }] });
    if (!customer) {
      customer = await Customer.create({ name: name || email.split('@')[0], email, googleId: uid,
        phone: '', password: Math.random().toString(36).slice(-12) });
    } else if (!customer.googleId) {
      customer.googleId = uid; await customer.save();
    }
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const data  = { _id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    res.json({ success: true, token, customer: data });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
//  PLOTS
// ════════════════════════════════════════════

router.get('/plots', async (req, res, next) => {
  try {
    const filter = { propertyType: 'plot', status: 'active', isVerified: true };
    if (req.query.facing)   filter['plotDetails.facing']   = req.query.facing;
    if (req.query.plotType) filter['plotDetails.plotType'] = req.query.plotType;
    if (req.query.search)   filter.$or = [
      { propertyName: { $regex: req.query.search, $options: 'i' } },
      { location:     { $regex: req.query.search, $options: 'i' } },
    ];
    if (req.query.minPrice || req.query.maxPrice) {
      filter['plotDetails.totalPrice'] = {};
      if (req.query.minPrice) filter['plotDetails.totalPrice'].$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) filter['plotDetails.totalPrice'].$lte = Number(req.query.maxPrice);
    }
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const [properties, total] = await Promise.all([
      Property.find(filter).populate('owner', 'name accountStatus isAadhaarVerified _id')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Property.countDocuments(filter),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), properties });
  } catch (err) { next(err); }
});

router.get('/plots/:id', async (req, res, next) => {
  try {
    const property = await Property.findOne({
      _id: req.params.id, propertyType: 'plot', status: 'active', isVerified: true,
    }).populate('owner', 'name accountStatus isAadhaarVerified _id');
    if (!property) return res.status(404).json({ success: false, message: 'Plot not found' });
    res.json({ success: true, property });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
//  SCHEDULED VISITS  (customer side)
// ════════════════════════════════════════════

// Book a visit
router.post('/visits', customerAuth, async (req, res, next) => {
  try {
    const { propertyId, visitorName, visitorPhone, visitDate, visitTime, requirement } = req.body;
    if (!propertyId || !visitorName || !visitorPhone || !visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'All required fields missing' });

    const property = await Property.findById(propertyId).populate('owner', '_id name');
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const visit = await Visit.create({
      property:    propertyId,
      owner:       property.owner._id,
      customer:    req.customerId,
      visitorName,
      visitorPhone,
      visitDate:   new Date(visitDate),
      visitTime,
      requirement: requirement || '',
    });

    res.status(201).json({ success: true, message: 'Visit booked', visit });
  } catch (err) { next(err); }
});

// Customer's own visits
router.get('/visits', customerAuth, async (req, res, next) => {
  try {
    const visits = await Visit.find({ customer: req.customerId })
      .populate('property', 'propertyName location photos')
      .sort({ visitDate: 1 });
    res.json({ success: true, visits });
  } catch (err) { next(err); }
});

// Cancel a visit (customer)
router.patch('/visits/:id/cancel', customerAuth, async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, customer: req.customerId },
      { status: 'cancelled' }, { new: true });
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });
    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /customers/visits/:id/edit — Customer (sender) edits visit date/time
router.patch('/visits/:id/edit', customerAuth, async (req, res, next) => {
  try {
    const { visitDate, visitTime } = req.body;
    if (!visitDate || !visitTime)
      return res.status(400).json({ success: false, message: 'visitDate and visitTime are required' });

    const visit = await Visit.findOne({ _id: req.params.id, customer: req.customerId })
      .populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found or not yours' });
    if (['cancelled', 'completed'].includes(visit.status))
      return res.status(400).json({ success: false, message: 'Cannot edit a ' + visit.status + ' visit' });

    visit.visitDate = new Date(visitDate);
    visit.visitTime = visitTime;
    visit.status    = 'pending'; // reset to pending so owner must accept
    await visit.save();

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// PATCH /customers/visits/:id/accept — Customer accepts owner's edit
router.patch('/visits/:id/accept', customerAuth, async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, customer: req.customerId },
      { status: 'confirmed' },
      { new: true }
    ).populate('property', 'propertyName');
    if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

    res.json({ success: true, visit });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
//  CHAT — Customer side
// ════════════════════════════════════════════

// Get or create chat
router.post('/chats', customerAuth, async (req, res, next) => {
  try {
    const { plotId, ownerId } = req.body;
    if (!plotId || !ownerId)
      return res.status(400).json({ success: false, message: 'plotId and ownerId required' });
    let chat = await Chat.findOne({ customer: req.customerId, owner: ownerId, property: plotId })
      .populate('property', 'propertyName photos')
      .populate('owner', 'name');
    if (!chat) {
      chat = await Chat.create({ customer: req.customerId, owner: ownerId, property: plotId });
      chat = await Chat.findById(chat._id)
        .populate('property', 'propertyName photos')
        .populate('owner', 'name');
    }
    res.json({ success: true, chat });
  } catch (err) { next(err); }
});

// All chats for customer
router.get('/chats', customerAuth, async (req, res, next) => {
  try {
    const chats = await Chat.find({ customer: req.customerId })
      .populate('property', 'propertyName photos location')
      .populate('owner', 'name')
      .sort({ lastMessageAt: -1 });
    res.json({ success: true, chats });
  } catch (err) { next(err); }
});

// Get messages
router.get('/chats/:chatId/messages', customerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, customer: req.customerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    await Chat.findByIdAndUpdate(chat._id, { unreadByCustomer: 0 });
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 40;
    const messages = await Message.find({ chat: chat._id, isBlocked: false })
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.json({ success: true, messages: messages.reverse() });
  } catch (err) { next(err); }
});

// Send message (customer)
router.post('/chats/:chatId/messages', customerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, customer: req.customerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    const { text = '', imageUrl, linkUrl } = req.body;
    const check = detectPhone(text);
    if (check.blocked)
      return res.status(422).json({ success: false, blocked: true, message: check.reason });

    const message = await Message.create({
      chat: chat._id, senderType: 'customer', senderId: req.customerId,
      text: text.trim(), imageUrl: imageUrl || null, linkUrl: linkUrl || null,
    });
    const preview = imageUrl ? '📷 Photo' : linkUrl ? '🔗 Link' : text.substring(0, 60);
    await Chat.findByIdAndUpdate(chat._id,
      { lastMessage: preview, lastMessageAt: new Date(), $inc: { unreadByOwner: 1 } });

    // No notification to owner for chat — owners see unread count in chat list
    res.status(201).json({ success: true, message });
  } catch (err) { next(err); }
});

// Poll for new messages (customer)
router.get('/chats/:chatId/poll', customerAuth, async (req, res, next) => {
  try {
    const { since } = req.query;
    const chat = await Chat.findOne({ _id: req.params.chatId, customer: req.customerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    const filter = { chat: chat._id, isBlocked: false };
    if (since) filter.createdAt = { $gt: new Date(since) };
    const messages = await Message.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
//  CHAT — Owner side (reply to customers)
// ════════════════════════════════════════════

// Get all chats for owner
router.get('/owner-chats', ownerAuth, async (req, res, next) => {
  try {
    const chats = await Chat.find({ owner: req.ownerId })
      .populate('property', 'propertyName photos')
      .populate('customer', 'name email')
      .sort({ lastMessageAt: -1 });
    res.json({ success: true, chats });
  } catch (err) { next(err); }
});

// Get messages for owner
router.get('/owner-chats/:chatId/messages', ownerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, owner: req.ownerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    await Chat.findByIdAndUpdate(chat._id, { unreadByOwner: 0 });
    const messages = await Message.find({ chat: chat._id, isBlocked: false })
      .sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) { next(err); }
});

// Owner sends reply
router.post('/owner-chats/:chatId/messages', ownerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, owner: req.ownerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    const { text = '', imageUrl, linkUrl } = req.body;
    const check = detectPhone(text);
    if (check.blocked)
      return res.status(422).json({ success: false, blocked: true, message: check.reason });

    const message = await Message.create({
      chat: chat._id, senderType: 'owner', senderId: req.ownerId,
      text: text.trim(), imageUrl: imageUrl || null, linkUrl: linkUrl || null,
    });
    const preview = imageUrl ? '📷 Photo' : linkUrl ? '🔗 Link' : text.substring(0, 60);
    await Chat.findByIdAndUpdate(chat._id,
      { lastMessage: preview, lastMessageAt: new Date(), $inc: { unreadByCustomer: 1 } });

    res.status(201).json({ success: true, message });
  } catch (err) { next(err); }
});

// Poll for new messages (owner)
router.get('/owner-chats/:chatId/poll', ownerAuth, async (req, res, next) => {
  try {
    const { since } = req.query;
    const chat = await Chat.findOne({ _id: req.params.chatId, owner: req.ownerId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    const filter = { chat: chat._id, isBlocked: false };
    if (since) filter.createdAt = { $gt: new Date(since) };
    const messages = await Message.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) { next(err); }
});


// ════════════════════════════════════════════
//  MESSAGE ACTIONS — edit, delete, upload photo
// ════════════════════════════════════════════

const { uploadPhotos, uploadAudio } = require('../config/cloudinary');
const multer = require('multer');

// Upload a photo for use in chat (returns URL)
// Customer
router.post('/chats/:chatId/upload', customerAuth,
  uploadPhotos.single('photo'),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({ _id: req.params.chatId, customer: req.customerId });
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

      const url = req.file.path || `/uploads/photos/${req.file.filename}`;

      // Create a message with just the image
      const message = await Message.create({
        chat: chat._id, senderType: 'customer', senderId: req.customerId,
        text: '', imageUrl: url,
      });
      await Chat.findByIdAndUpdate(chat._id,
        { lastMessage: '📷 Photo', lastMessageAt: new Date(), $inc: { unreadByOwner: 1 } });

      res.status(201).json({ success: true, message, imageUrl: url });
    } catch (err) { next(err); }
  }
);

// Customer upload audio
router.post('/chats/:chatId/upload-audio', customerAuth,
  uploadAudio.single('audio'),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({ _id: req.params.chatId, customer: req.customerId });
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
      if (!req.file) return res.status(400).json({ success: false, message: 'No audio uploaded' });
      const url = req.file.path || `/uploads/audio/${req.file.filename}`;
      const msg = await Message.create({
        chat: chat._id, senderType: 'customer', senderId: req.customerId,
        messageType: 'audio', audioUrl: url, text: '🎤 Voice message',
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: '🎤 Voice message', lastMessageAt: new Date(),
        $inc: { unreadByOwner: 1 },
      });
      res.json({ success: true, message: msg });
    } catch (err) { next(err); }
  }
);

// Owner upload photo
router.post('/owner-chats/:chatId/upload', ownerAuth,
  uploadPhotos.single('photo'),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({ _id: req.params.chatId, owner: req.ownerId });
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

      const url = req.file.path || `/uploads/photos/${req.file.filename}`;
      const message = await Message.create({
        chat: chat._id, senderType: 'owner', senderId: req.ownerId,
        text: '', imageUrl: url,
      });
      await Chat.findByIdAndUpdate(chat._id,
        { lastMessage: '📷 Photo', lastMessageAt: new Date(), $inc: { unreadByCustomer: 1 } });

      res.status(201).json({ success: true, message, imageUrl: url });
    } catch (err) { next(err); }
  }
);
// Owner upload audio
router.post('/owner-chats/:chatId/upload-audio', ownerAuth,
  uploadAudio.single('audio'),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({ _id: req.params.chatId, owner: req.ownerId });
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
      if (!req.file) return res.status(400).json({ success: false, message: 'No audio uploaded' });
      const url = req.file.path || `/uploads/audio/${req.file.filename}`;
      const msg = await Message.create({
        chat: chat._id, senderType: 'owner', senderId: req.ownerId,
        messageType: 'audio', audioUrl: url, text: '🎤 Voice message',
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: '🎤 Voice message', lastMessageAt: new Date(),
        $inc: { unreadByCustomer: 1 },
      });
      res.json({ success: true, message: msg });
    } catch (err) { next(err); }
  }
);


// PATCH /customers/chats/:chatId/messages/:msgId  — edit message text (sender only, within 15 min)
router.patch('/chats/:chatId/messages/:msgId', customerAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'New text required' });

    const check = detectPhone(text);
    if (check.blocked) return res.status(422).json({ success: false, blocked: true, message: check.reason });

    const msg = await Message.findOne({ _id: req.params.msgId, chat: req.params.chatId,
      senderType: 'customer', senderId: req.customerId, deletedForEveryone: false });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found or not yours' });

    const age = (Date.now() - new Date(msg.createdAt).getTime()) / 1000 / 60;
    if (age > 15) return res.status(403).json({ success: false, message: 'Messages can only be edited within 15 minutes' });

    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date();
    await msg.save();

    res.json({ success: true, message: msg });
  } catch (err) { next(err); }
});

// Owner edit
router.patch('/owner-chats/:chatId/messages/:msgId', ownerAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'New text required' });

    const check = detectPhone(text);
    if (check.blocked) return res.status(422).json({ success: false, blocked: true, message: check.reason });

    const msg = await Message.findOne({ _id: req.params.msgId, chat: req.params.chatId,
      senderType: 'owner', senderId: req.ownerId, deletedForEveryone: false });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found or not yours' });

    const age = (Date.now() - new Date(msg.createdAt).getTime()) / 1000 / 60;
    if (age > 15) return res.status(403).json({ success: false, message: 'Messages can only be edited within 15 minutes' });

    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date();
    await msg.save();

    res.json({ success: true, message: msg });
  } catch (err) { next(err); }
});

// DELETE — customer
// body: { scope: "me" | "everyone" }
router.delete('/chats/:chatId/messages/:msgId', customerAuth, async (req, res, next) => {
  try {
    const { scope } = req.body;
    const msg = await Message.findOne({ _id: req.params.msgId, chat: req.params.chatId });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (scope === 'everyone') {
      // Only sender can delete for everyone — no time limit
      if (msg.senderType !== 'customer' || String(msg.senderId) !== String(req.customerId))
        return res.status(403).json({ success: false, message: 'Only the sender can delete for everyone' });
      msg.deletedForEveryone = true;
      msg.text = '';
      msg.imageUrl = null;
      msg.linkUrl = null;
    } else {
      msg.deletedForSender = true;
    }
    await msg.save();
    res.json({ success: true, message: msg });
  } catch (err) { next(err); }
});

// DELETE — owner
router.delete('/owner-chats/:chatId/messages/:msgId', ownerAuth, async (req, res, next) => {
  try {
    const { scope } = req.body;
    const msg = await Message.findOne({ _id: req.params.msgId, chat: req.params.chatId });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (scope === 'everyone') {
      // Only sender can delete for everyone — no time limit
      if (msg.senderType !== 'owner' || String(msg.senderId) !== String(req.ownerId))
        return res.status(403).json({ success: false, message: 'Only the sender can delete for everyone' });
      msg.deletedForEveryone = true;
      msg.text = '';
      msg.imageUrl = null;
      msg.linkUrl = null;
    } else {
      msg.deletedForSender = true;
    }
    await msg.save();
    res.json({ success: true, message: msg });
  } catch (err) { next(err); }
});


// ════════════════════════════════════════════
//  FAVOURITES
// ════════════════════════════════════════════

// GET /api/customers/favourites — get all saved plots for customer
router.get('/favourites', customerAuth, async (req, res, next) => {
  try {
    const favs = await Favourite.find({ customer: req.customerId })
      .populate({
        path: 'property',
        populate: { path: 'owner', select: 'name accountStatus isAadhaarVerified' },
      })
      .sort({ createdAt: -1 });

    const properties = favs
      .filter(f => f.property && f.property.status === 'active')
      .map(f => ({ ...f.property.toObject(), isFavourited: true }));

    res.json({ success: true, count: properties.length, properties });
  } catch (err) { next(err); }
});

// POST /api/customers/favourites/:plotId — add to favourites
router.post('/favourites/:plotId', customerAuth, async (req, res, next) => {
  try {
    const exists = await Favourite.findOne({ customer: req.customerId, property: req.params.plotId });
    if (exists) return res.json({ success: true, favourited: true, message: 'Already in favourites' });

    await Favourite.create({ customer: req.customerId, property: req.params.plotId });
    res.json({ success: true, favourited: true, message: 'Added to favourites' });
  } catch (err) { next(err); }
});

// DELETE /api/customers/favourites/:plotId — remove from favourites
router.delete('/favourites/:plotId', customerAuth, async (req, res, next) => {
  try {
    await Favourite.findOneAndDelete({ customer: req.customerId, property: req.params.plotId });
    res.json({ success: true, favourited: false, message: 'Removed from favourites' });
  } catch (err) { next(err); }
});

// GET /api/customers/favourites/check/:plotId — check if a plot is favourited
router.get('/favourites/check/:plotId', customerAuth, async (req, res, next) => {
  try {
    const exists = await Favourite.findOne({ customer: req.customerId, property: req.params.plotId });
    res.json({ success: true, favourited: !!exists });
  } catch (err) { next(err); }
});

// GET /api/customers/favourites/ids — get all favourited plot IDs (for bulk heart state)
router.get('/favourites/ids', customerAuth, async (req, res, next) => {
  try {
    const favs = await Favourite.find({ customer: req.customerId }).select('property');
    const ids  = favs.map(f => f.property.toString());
    res.json({ success: true, ids });
  } catch (err) { next(err); }
});

module.exports = router;
