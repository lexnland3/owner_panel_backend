const express = require("express");
const router = express.Router();
const Property = require("../models/Property");
const Visit = require("../models/Visit");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Favourite = require("../models/Favourite");
const Rating = require("../models/Rating");
const SupportTicket = require("../models/SupportTicket");
const Owner = require("../models/Owner");
const { detectPhone } = require("../utils/phoneDetector");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

// ── Customer model ────────────────────────────────────────────
let Customer;
try {
  Customer = mongoose.model("Customer");
} catch (_) {
  const s = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true },
      phone: { type: String, default: "" },
      password: { type: String, select: false },
      googleId: { type: String, default: null },
      // ── Profile details ──
      age: { type: Number, default: null },
      gender: {
        type: String,
        enum: ["male", "female", "other", ""],
        default: "",
      },
      occupation: { type: String, default: "" },
      state: { type: String, default: "" },
      city: { type: String, default: "" },
      lookingFor: { type: String, default: "" }, // optional: plot / pg / guest
      profilePhoto: { type: String, default: null }, // optional
      isSuspended: { type: Boolean, default: false }, // admin can ban
    },
    { timestamps: true },
  );
  s.pre("save", async function (next) {
    if (!this.isModified("password") || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
  });
  Customer = mongoose.model("Customer", s);
}

// ── Customer auth middleware ───────────────────────────────────
const customerAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "customer")
      return res
        .status(403)
        .json({ success: false, message: "Customer access only" });
    const cust = await Customer.findById(decoded.id);
    if (!cust)
      return res
        .status(401)
        .json({ success: false, message: "Customer not found" });
    if (cust.isSuspended)
      return res.status(403).json({
        success: false,
        message:
          "Your account has been suspended. Please contact support.",
      });
    req.customerId = decoded.id;
    req.customer = cust;
    next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ── Owner auth middleware (for owner to reply in chat) ─────────
const ownerAuth = async (req, res, next) => {
  try {
    const Owner = require("../models/Owner");
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const owner = await Owner.findById(decoded.id);
    if (!owner)
      return res
        .status(401)
        .json({ success: false, message: "Owner not found" });
    if (owner.accountStatus === "suspended")
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact support.",
      });
    req.ownerId = decoded.id;
    req.owner = owner;
    next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, phone, password, state, city } = req.body;
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ success: false, message: "name, email and password required" });
    if (await Customer.findOne({ email }))
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    const customer = await Customer.create({
      name,
      email,
      phone: phone || "",
      password,
      state: state || "",
      city: city || "",
    });
    const token = jwt.sign(
      { id: customer._id, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.status(201).json({
      success: true,
      token,
      customer: { _id: customer._id, name, email, phone },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const customer = await Customer.findOne({ email }).select("+password");
    if (!customer || !(await bcrypt.compare(password, customer.password)))
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    const token = jwt.sign(
      { id: customer._id, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );
    const data = {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };
    res.json({ success: true, token, customer: data });
  } catch (err) {
    next(err);
  }
});

router.get("/me", customerAuth, async (req, res, next) => {
  try {
    res.json({ success: true, customer: req.customer });
  } catch (err) {
    next(err);
  }
});

// PATCH /customers/me — update customer profile details
router.patch("/me", customerAuth, async (req, res, next) => {
  try {
    const allowed = [
      "name",
      "phone",
      "age",
      "gender",
      "occupation",
      "state",
      "city",
      "lookingFor",
      "profilePhoto",
    ];
    const updates = {};
    for (const k of allowed)
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    const customer = await Customer.findByIdAndUpdate(req.customerId, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const { verifyFirebaseToken } = require("../config/firebase");
    const Owner = require("../models/Owner");
    const { idToken } = req.body;
    if (!idToken)
      return res
        .status(400)
        .json({ success: false, message: "idToken required" });
    const result = await verifyFirebaseToken(idToken);
    if (!result.valid)
      return res
        .status(401)
        .json({ success: false, message: `Invalid token: ${result.error}` });
    const { uid, email, name } = result.decoded;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Could not get email from Google" });
    // Unified platform: the same Google account can be BOTH a buyer and a
    // seller. We no longer block customer sign-in for emails that also have an
    // Owner record — the two are separate profiles under one login.
    let customer = await Customer.findOne({
      $or: [{ googleId: uid }, { email }],
    });
    if (!customer) {
      customer = await Customer.create({
        name: name || email.split("@")[0],
        email,
        googleId: uid,
        phone: "",
        password: Math.random().toString(36).slice(-12),
      });
    } else if (!customer.googleId) {
      customer.googleId = uid;
      await customer.save();
    }
    const token = jwt.sign(
      { id: customer._id, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );
    const data = {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };
    res.json({ success: true, token, customer: data });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  PLOTS
// ════════════════════════════════════════════

router.get("/plots", async (req, res, next) => {
  try {
    const filter = { propertyType: "plot", status: "active", isVerified: true };
    if (req.query.facing) filter["plotDetails.facing"] = req.query.facing;
    if (req.query.plotType) filter["plotDetails.plotType"] = req.query.plotType;
    if (req.query.minPrice || req.query.maxPrice) {
      filter["plotDetails.totalPrice"] = {};
      if (req.query.minPrice)
        filter["plotDetails.totalPrice"].$gte = Number(req.query.minPrice);
      if (req.query.maxPrice)
        filter["plotDetails.totalPrice"].$lte = Number(req.query.maxPrice);
    }

    // Properties store a free-text `location` (e.g. "Amritsar, Punjab"), so
    // search / city / state all match against propertyName + location.
    const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const and = [];

    // Refined search: EVERY word must appear in the name or the location.
    if (req.query.search && req.query.search.trim()) {
      for (const term of req.query.search.trim().split(/\s+/)) {
        const rx = { $regex: esc(term), $options: "i" };
        and.push({ $or: [{ propertyName: rx }, { location: rx }] });
      }
    }
    // State / City filter — matched against the plot's location text.
    if (req.query.state && req.query.state.trim())
      and.push({
        location: { $regex: esc(req.query.state.trim()), $options: "i" },
      });
    if (req.query.city && req.query.city.trim())
      and.push({
        location: { $regex: esc(req.query.city.trim()), $options: "i" },
      });

    if (and.length) filter.$and = and;

    // If the viewer is a logged-in customer who also has an owner account,
    // hide their own plots from the browse list (you don't shop your own).
    const _token = req.headers.authorization?.split(" ")[1];
    if (_token) {
      try {
        const _decoded = jwt.verify(_token, process.env.JWT_SECRET);
        if (_decoded.role === "customer") {
          const _cust = await Customer.findById(_decoded.id).select("email");
          if (_cust && _cust.email) {
            const OwnerModel = require("../models/Owner");
            const _myOwner = await OwnerModel.findOne({
              email: _cust.email,
            }).select("_id");
            if (_myOwner) filter.owner = { $ne: _myOwner._id };
          }
        }
      } catch (_) {
        /* not logged in / bad token → just show everything */
      }
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate("owner", "name accountStatus isAadhaarVerified _id")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Property.countDocuments(filter),
    ]);
    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      properties,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/plots/:id", async (req, res, next) => {
  try {
    // Atomically fetch the plot AND count this open as one view (+1).
    const property = await Property.findOneAndUpdate(
      {
        _id: req.params.id,
        propertyType: "plot",
        status: "active",
        isVerified: true,
      },
      { $inc: { views: 1 } },
      { new: true },
    ).populate("owner", "name accountStatus isAadhaarVerified _id");
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Plot not found" });
    res.json({ success: true, property });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  PLOT RATINGS  (customer side)
// ════════════════════════════════════════════

// Submit or update this customer's rating for a plot, then recompute average
router.post("/plots/:id/rate", customerAuth, async (req, res, next) => {
  try {
    const r = Number(req.body.rating);
    if (!Number.isFinite(r) || r < 1 || r > 5)
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });

    const plot = await Property.findOne({
      _id: req.params.id,
      propertyType: "plot",
    });
    if (!plot)
      return res
        .status(404)
        .json({ success: false, message: "Plot not found" });

    // upsert this customer's rating (one per customer per plot)
    await Rating.findOneAndUpdate(
      { property: plot._id, customer: req.customerId },
      { rating: Math.round(r) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // recompute average + count from all ratings
    const agg = await Rating.aggregate([
      { $match: { property: plot._id } },
      {
        $group: {
          _id: "$property",
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);
    const avg = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
    const count = agg.length ? agg[0].count : 0;

    plot.ratingAverage = avg;
    plot.ratingCount = count;
    await plot.save();

    res.json({
      success: true,
      ratingAverage: avg,
      ratingCount: count,
      myRating: Math.round(r),
    });
  } catch (err) {
    next(err);
  }
});

// Get this customer's own rating for a plot (0 = not rated yet)
router.get("/plots/:id/my-rating", customerAuth, async (req, res, next) => {
  try {
    const rt = await Rating.findOne({
      property: req.params.id,
      customer: req.customerId,
    });
    res.json({ success: true, myRating: rt ? rt.rating : 0 });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  SCHEDULED VISITS  (customer side)
// ════════════════════════════════════════════

// Book a visit
router.post("/visits", customerAuth, async (req, res, next) => {
  try {
    const {
      propertyId,
      visitorName,
      visitorPhone,
      visitDate,
      visitTime,
      requirement,
    } = req.body;
    if (
      !propertyId ||
      !visitorName ||
      !visitorPhone ||
      !visitDate ||
      !visitTime
    )
      return res
        .status(400)
        .json({ success: false, message: "All required fields missing" });

    const property = await Property.findById(propertyId).populate(
      "owner",
      "_id name",
    );
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    const visit = await Visit.create({
      property: propertyId,
      owner: property.owner._id,
      customer: req.customerId,
      visitorName,
      visitorPhone,
      visitDate: new Date(visitDate),
      visitTime,
      requirement: requirement || "",
      status: "pending",
      proposedBy: "customer",
      awaitingFrom: "owner", // customer proposed -> owner's turn
      proposals: [
        {
          by: "customer",
          date: new Date(visitDate),
          time: visitTime,
          note: requirement || "",
        },
      ],
    });

    // Notify owner — important, kept concise
    await Notification.create({
      owner: property.owner._id,
      title: "📅 Site Visit Request",
      message: `${visitorName} wants to visit "${property.propertyName}" on ${new Date(visitDate).toLocaleDateString("en-IN")} at ${visitTime}.`,
      type: "visit",
    });

    res.status(201).json({ success: true, message: "Visit booked", visit });
  } catch (err) {
    next(err);
  }
});

// Customer's own visits
router.get("/visits", customerAuth, async (req, res, next) => {
  try {
    const visits = await Visit.find({ customer: req.customerId })
      .populate("property", "propertyName location photos")
      .sort({ visitDate: 1 });
    res.json({ success: true, visits });
  } catch (err) {
    next(err);
  }
});

// Cancel a visit (customer)
router.patch("/visits/:id/cancel", customerAuth, async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, customer: req.customerId },
      { status: "cancelled", awaitingFrom: null },
      { new: true },
    );
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });
    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

// Customer ACCEPTS the slot currently on the table (e.g. owner's proposal)
router.patch("/visits/:id/accept", customerAuth, async (req, res, next) => {
  try {
    const visit = await Visit.findOne({
      _id: req.params.id,
      customer: req.customerId,
    }).populate("property", "propertyName");
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });
    if (visit.awaitingFrom !== "customer")
      return res
        .status(400)
        .json({ success: false, message: "Nothing to accept right now" });

    visit.status = "confirmed";
    visit.awaitingFrom = null;
    await visit.save();

    // Notify owner that the customer accepted.
    await Notification.create({
      owner: visit.owner,
      title: "✅ Visit Accepted",
      message: `${visit.visitorName} accepted the visit for "${visit.property?.propertyName || "your property"}".`,
      type: "visit",
    });

    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

// Customer COUNTER-PROPOSES a different slot -> ball goes back to owner
router.patch("/visits/:id/propose", customerAuth, async (req, res, next) => {
  try {
    const { newDate, newTime, note } = req.body;
    if (!newDate || !newTime)
      return res
        .status(400)
        .json({ success: false, message: "newDate and newTime required" });

    const visit = await Visit.findOne({
      _id: req.params.id,
      customer: req.customerId,
    }).populate("property", "propertyName");
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });
    if (["confirmed", "cancelled", "completed"].includes(visit.status))
      return res
        .status(400)
        .json({ success: false, message: "This visit is already settled" });

    visit.visitDate = new Date(newDate);
    visit.visitTime = newTime;
    visit.status = "rescheduled"; // active proposal on the table
    visit.awaitingFrom = "owner"; // owner's turn now
    visit.proposedBy = "customer";
    visit.proposals.push({
      by: "customer",
      date: new Date(newDate),
      time: newTime,
      note: note || "",
    });
    await visit.save();

    // Notify owner of the customer's counter-proposal.
    await Notification.create({
      owner: visit.owner,
      title: "🔁 New Time Proposed",
      message: `${visit.visitorName} proposed a new time for "${visit.property?.propertyName || "your property"}": ${new Date(newDate).toLocaleDateString("en-IN")} at ${newTime}.`,
      type: "visit",
    });

    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  CHAT — Customer side
// ════════════════════════════════════════════

// Get or create chat
router.post("/chats", customerAuth, async (req, res, next) => {
  try {
    const { plotId, ownerId } = req.body;
    if (!ownerId)
      return res
        .status(400)
        .json({ success: false, message: "ownerId required" });
    // Block self-chat: if the logged-in user is also the owner of this plot
    // (same email across their customer + owner profiles), don't let them
    // start a conversation with themselves.
    const OwnerModel = require("../models/Owner");
    const targetOwner = await OwnerModel.findById(ownerId).select("email");
    if (
      targetOwner &&
      req.customer.email &&
      String(targetOwner.email).toLowerCase() ===
        String(req.customer.email).toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        isOwnPlot: true,
        message: "This is your own plot — you can't chat with yourself.",
      });
    }
    // One thread per customer-owner pair (not per plot).
    let chat = await Chat.findOne({
      customer: req.customerId,
      owner: ownerId,
    });
    if (!chat) {
      chat = await Chat.create({
        customer: req.customerId,
        owner: ownerId,
        property: plotId || null,
      });
    } else if (plotId && String(chat.property) !== String(plotId)) {
      // Same owner, different plot → keep the single thread, just refresh
      // the plot shown as context in the list/header.
      chat.property = plotId;
      await chat.save();
    }
    chat = await Chat.findById(chat._id)
      .populate("property", "propertyName photos")
      .populate("owner", "name");
    res.json({ success: true, chat });
  } catch (err) {
    next(err);
  }
});

// All chats for customer
router.get("/chats", customerAuth, async (req, res, next) => {
  try {
    let chats = await Chat.find({ customer: req.customerId })
      .populate("property", "propertyName photos location")
      .populate("owner", "name email")
      .sort({ lastMessageAt: -1 });
    // Hide self-chats: a thread whose owner is the user's own owner account.
    const myEmail = String(req.customer.email || "").toLowerCase();

    // Build an accurate preview from each chat's most recent message so the
    // list reflects deletions/edits (not a stale cached value).
    const ids = chats.map((c) => c._id);
    const lastMsgs = await Message.aggregate([
      { $match: { chat: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$chat", m: { $first: "$$ROOT" } } },
    ]);
    const lastMap = {};
    lastMsgs.forEach((x) => {
      lastMap[String(x._id)] = x.m;
    });
    const previewOf = (m) => {
      if (!m) return "";
      if (m.deletedForEveryone) return "This message was deleted";
      if (m.imageUrl) return "📷 Photo";
      if (m.audioUrl) return "🎤 Voice message";
      if (m.linkUrl) return "🔗 Link";
      return (m.text || "").substring(0, 60);
    };

    chats = chats
      .filter((c) => String(c.owner?.email || "").toLowerCase() !== myEmail)
      .map((c) => {
        const o = c.toObject();
        if (o.owner) delete o.owner.email; // don't leak owner email to client
        const lm = lastMap[String(o._id)];
        if (lm) o.lastMessage = previewOf(lm);
        return o;
      });
    res.json({ success: true, chats });
  } catch (err) {
    next(err);
  }
});

// Unread chat count (number of conversations with new messages)
router.get("/chats/unread-count", customerAuth, async (req, res, next) => {
  try {
    const count = await Chat.countDocuments({
      customer: req.customerId,
      unreadByCustomer: { $gt: 0 },
    });
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

// Get messages
router.get("/chats/:chatId/messages", customerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      customer: req.customerId,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    await Chat.findByIdAndUpdate(chat._id, { unreadByCustomer: 0 });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 40;
    const messages = await Message.find({ chat: chat._id, isBlocked: false })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

// Send message (customer)
router.post("/chats/:chatId/messages", customerAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      customer: req.customerId,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    const { text = "", imageUrl, linkUrl } = req.body;
    const check = detectPhone(text);
    if (check.blocked)
      return res
        .status(422)
        .json({ success: false, blocked: true, message: check.reason });

    const message = await Message.create({
      chat: chat._id,
      senderType: "customer",
      senderId: req.customerId,
      text: text.trim(),
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
    });
    const preview = imageUrl
      ? "📷 Photo"
      : linkUrl
        ? "🔗 Link"
        : text.substring(0, 60);
    await Chat.findByIdAndUpdate(chat._id, {
      lastMessage: preview,
      lastMessageAt: new Date(),
      $inc: { unreadByOwner: 1 },
    });

    // No notification to owner for chat — owners see unread count in chat list
    res.status(201).json({ success: true, message });
  } catch (err) {
    next(err);
  }
});

// Poll for new messages (customer)
router.get("/chats/:chatId/poll", customerAuth, async (req, res, next) => {
  try {
    const { since } = req.query;
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      customer: req.customerId,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    const filter = { chat: chat._id, isBlocked: false };
    if (since) filter.createdAt = { $gt: new Date(since) };
    const messages = await Message.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  CHAT — Owner side (reply to customers)
// ════════════════════════════════════════════

// Get all chats for owner
router.get("/owner-chats", ownerAuth, async (req, res, next) => {
  try {
    let chats = await Chat.find({ owner: req.ownerId })
      .populate("property", "propertyName photos")
      .populate("customer", "name email")
      .sort({ lastMessageAt: -1 });
    // Hide self-chats (thread with your own customer account).
    const myEmail = String(req.owner.email || "").toLowerCase();

    // Accurate preview from each chat's most recent message.
    const ids = chats.map((c) => c._id);
    const lastMsgs = await Message.aggregate([
      { $match: { chat: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$chat", m: { $first: "$$ROOT" } } },
    ]);
    const lastMap = {};
    lastMsgs.forEach((x) => {
      lastMap[String(x._id)] = x.m;
    });
    const previewOf = (m) => {
      if (!m) return "";
      if (m.deletedForEveryone) return "This message was deleted";
      if (m.imageUrl) return "📷 Photo";
      if (m.audioUrl) return "🎤 Voice message";
      if (m.linkUrl) return "🔗 Link";
      return (m.text || "").substring(0, 60);
    };

    chats = chats
      .filter(
        (c) => String(c.customer?.email || "").toLowerCase() !== myEmail,
      )
      .map((c) => {
        const o = c.toObject();
        const lm = lastMap[String(o._id)];
        if (lm) o.lastMessage = previewOf(lm);
        return o;
      });
    res.json({ success: true, chats });
  } catch (err) {
    next(err);
  }
});

// Owner unread chat count (number of conversations with new messages)
router.get("/owner-chats/unread-count", ownerAuth, async (req, res, next) => {
  try {
    const count = await Chat.countDocuments({
      owner: req.ownerId,
      unreadByOwner: { $gt: 0 },
    });
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

// Get messages for owner
router.get(
  "/owner-chats/:chatId/messages",
  ownerAuth,
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        owner: req.ownerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      await Chat.findByIdAndUpdate(chat._id, { unreadByOwner: 0 });
      const messages = await Message.find({
        chat: chat._id,
        isBlocked: false,
      }).sort({ createdAt: 1 });
      res.json({ success: true, messages });
    } catch (err) {
      next(err);
    }
  },
);

// Owner sends reply
router.post(
  "/owner-chats/:chatId/messages",
  ownerAuth,
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        owner: req.ownerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      const { text = "", imageUrl, linkUrl } = req.body;
      const check = detectPhone(text);
      if (check.blocked)
        return res
          .status(422)
          .json({ success: false, blocked: true, message: check.reason });

      const message = await Message.create({
        chat: chat._id,
        senderType: "owner",
        senderId: req.ownerId,
        text: text.trim(),
        imageUrl: imageUrl || null,
        linkUrl: linkUrl || null,
      });
      const preview = imageUrl
        ? "📷 Photo"
        : linkUrl
          ? "🔗 Link"
          : text.substring(0, 60);
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: preview,
        lastMessageAt: new Date(),
        $inc: { unreadByCustomer: 1 },
      });

      res.status(201).json({ success: true, message });
    } catch (err) {
      next(err);
    }
  },
);

// Poll for new messages (owner)
router.get("/owner-chats/:chatId/poll", ownerAuth, async (req, res, next) => {
  try {
    const { since } = req.query;
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      owner: req.ownerId,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    const filter = { chat: chat._id, isBlocked: false };
    if (since) filter.createdAt = { $gt: new Date(since) };
    const messages = await Message.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  MESSAGE ACTIONS — edit, delete, upload photo
// ════════════════════════════════════════════

const {
  uploadPhotos,
  fileToUrl,
  deleteImage,
  uploadAudio,
} = require("../config/cloudinary");
const multer = require("multer");

// Upload a photo for use in chat (returns URL)
// Customer
router.post(
  "/chats/:chatId/upload",
  customerAuth,
  uploadPhotos.single("photo"),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        customer: req.customerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      const url = fileToUrl(req.file);

      // Create a message with just the image
      const message = await Message.create({
        chat: chat._id,
        senderType: "customer",
        senderId: req.customerId,
        text: "",
        imageUrl: url,
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: "📷 Photo",
        lastMessageAt: new Date(),
        $inc: { unreadByOwner: 1 },
      });

      res.status(201).json({ success: true, message, imageUrl: url });
    } catch (err) {
      next(err);
    }
  },
);

// Owner upload photo
router.post(
  "/owner-chats/:chatId/upload",
  ownerAuth,
  uploadPhotos.single("photo"),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        owner: req.ownerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      const url = fileToUrl(req.file);
      const message = await Message.create({
        chat: chat._id,
        senderType: "owner",
        senderId: req.ownerId,
        text: "",
        imageUrl: url,
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: "📷 Photo",
        lastMessageAt: new Date(),
        $inc: { unreadByCustomer: 1 },
      });

      res.status(201).json({ success: true, message, imageUrl: url });
    } catch (err) {
      next(err);
    }
  },
);

// ── Voice messages (audio upload) ────────────────────────────
// Customer upload audio
router.post(
  "/chats/:chatId/audio",
  customerAuth,
  uploadAudio.single("audio"),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        customer: req.customerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      const url = fileToUrl(req.file);
      const duration = Number(req.body.duration) || 0;
      const message = await Message.create({
        chat: chat._id,
        senderType: "customer",
        senderId: req.customerId,
        text: "",
        audioUrl: url,
        audioDuration: duration,
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: "🎤 Voice message",
        lastMessageAt: new Date(),
        $inc: { unreadByOwner: 1 },
      });

      res.status(201).json({ success: true, message, audioUrl: url });
    } catch (err) {
      next(err);
    }
  },
);

// Owner upload audio
router.post(
  "/owner-chats/:chatId/audio",
  ownerAuth,
  uploadAudio.single("audio"),
  async (req, res, next) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.chatId,
        owner: req.ownerId,
      });
      if (!chat)
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      const url = fileToUrl(req.file);
      const duration = Number(req.body.duration) || 0;
      const message = await Message.create({
        chat: chat._id,
        senderType: "owner",
        senderId: req.ownerId,
        text: "",
        audioUrl: url,
        audioDuration: duration,
      });
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: "🎤 Voice message",
        lastMessageAt: new Date(),
        $inc: { unreadByCustomer: 1 },
      });

      res.status(201).json({ success: true, message, audioUrl: url });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /customers/chats/:chatId/messages/:msgId  — edit message text (sender only, within 15 min)
router.patch(
  "/chats/:chatId/messages/:msgId",
  customerAuth,
  async (req, res, next) => {
    try {
      const { text } = req.body;
      if (!text || !text.trim())
        return res
          .status(400)
          .json({ success: false, message: "New text required" });

      const check = detectPhone(text);
      if (check.blocked)
        return res
          .status(422)
          .json({ success: false, blocked: true, message: check.reason });

      const msg = await Message.findOne({
        _id: req.params.msgId,
        chat: req.params.chatId,
        senderType: "customer",
        senderId: req.customerId,
        deletedForEveryone: false,
      });
      if (!msg)
        return res
          .status(404)
          .json({ success: false, message: "Message not found or not yours" });

      msg.text = text.trim();
      msg.isEdited = true;
      msg.editedAt = new Date();
      await msg.save();

      res.json({ success: true, message: msg });
    } catch (err) {
      next(err);
    }
  },
);

// Owner edit
router.patch(
  "/owner-chats/:chatId/messages/:msgId",
  ownerAuth,
  async (req, res, next) => {
    try {
      const { text } = req.body;
      if (!text || !text.trim())
        return res
          .status(400)
          .json({ success: false, message: "New text required" });

      const check = detectPhone(text);
      if (check.blocked)
        return res
          .status(422)
          .json({ success: false, blocked: true, message: check.reason });

      const msg = await Message.findOne({
        _id: req.params.msgId,
        chat: req.params.chatId,
        senderType: "owner",
        senderId: req.ownerId,
        deletedForEveryone: false,
      });
      if (!msg)
        return res
          .status(404)
          .json({ success: false, message: "Message not found or not yours" });

      msg.text = text.trim();
      msg.isEdited = true;
      msg.editedAt = new Date();
      await msg.save();

      res.json({ success: true, message: msg });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE — customer
// body: { scope: "me" | "everyone" }
router.delete(
  "/chats/:chatId/messages/:msgId",
  customerAuth,
  async (req, res, next) => {
    try {
      const { scope } = req.body;
      const msg = await Message.findOne({
        _id: req.params.msgId,
        chat: req.params.chatId,
      });
      if (!msg)
        return res
          .status(404)
          .json({ success: false, message: "Message not found" });

      if (scope === "everyone") {
        // Only sender can delete for everyone, within 60 min
        if (
          msg.senderType !== "customer" ||
          String(msg.senderId) !== String(req.customerId)
        )
          return res.status(403).json({
            success: false,
            message: "Only the sender can delete for everyone",
          });
        // Remove the actual image from storage (Cloudinary/local) immediately
        if (msg.imageUrl) {
          try {
            await deleteImage(msg.imageUrl);
          } catch (_) {}
        }
        if (msg.audioUrl) {
          try {
            await deleteImage(msg.audioUrl);
          } catch (_) {}
        }
        msg.deletedForEveryone = true;
        msg.text = "";
        msg.imageUrl = null;
        msg.audioUrl = null;
        msg.linkUrl = null;
      } else {
        msg.deletedForSender = true;
      }
      await msg.save();

      // Refresh the chat's last-message preview so the chat list stops
      // showing a message that was just deleted for everyone.
      if (scope === "everyone") {
        const lastMsg = await Message.findOne({ chat: msg.chat }).sort({
          createdAt: -1,
        });
        let preview = "";
        if (lastMsg) {
          if (lastMsg.deletedForEveryone)
            preview = "This message was deleted";
          else if (lastMsg.imageUrl) preview = "📷 Photo";
          else if (lastMsg.audioUrl) preview = "🎤 Voice message";
          else if (lastMsg.linkUrl) preview = "🔗 Link";
          else preview = (lastMsg.text || "").substring(0, 60);
        }
        await Chat.findByIdAndUpdate(msg.chat, { lastMessage: preview });
      }

      res.json({ success: true, message: msg });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE — owner
router.delete(
  "/owner-chats/:chatId/messages/:msgId",
  ownerAuth,
  async (req, res, next) => {
    try {
      const { scope } = req.body;
      const msg = await Message.findOne({
        _id: req.params.msgId,
        chat: req.params.chatId,
      });
      if (!msg)
        return res
          .status(404)
          .json({ success: false, message: "Message not found" });

      if (scope === "everyone") {
        if (
          msg.senderType !== "owner" ||
          String(msg.senderId) !== String(req.ownerId)
        )
          return res.status(403).json({
            success: false,
            message: "Only the sender can delete for everyone",
          });
        // Remove the actual image from storage (Cloudinary/local) immediately
        if (msg.imageUrl) {
          try {
            await deleteImage(msg.imageUrl);
          } catch (_) {}
        }
        if (msg.audioUrl) {
          try {
            await deleteImage(msg.audioUrl);
          } catch (_) {}
        }
        msg.deletedForEveryone = true;
        msg.text = "";
        msg.imageUrl = null;
        msg.audioUrl = null;
        msg.linkUrl = null;
      } else {
        msg.deletedForSender = true;
      }
      await msg.save();

      // Refresh the chat's last-message preview so the chat list stops
      // showing a message that was just deleted for everyone.
      if (scope === "everyone") {
        const lastMsg = await Message.findOne({ chat: msg.chat }).sort({
          createdAt: -1,
        });
        let preview = "";
        if (lastMsg) {
          if (lastMsg.deletedForEveryone)
            preview = "This message was deleted";
          else if (lastMsg.imageUrl) preview = "📷 Photo";
          else if (lastMsg.audioUrl) preview = "🎤 Voice message";
          else if (lastMsg.linkUrl) preview = "🔗 Link";
          else preview = (lastMsg.text || "").substring(0, 60);
        }
        await Chat.findByIdAndUpdate(msg.chat, { lastMessage: preview });
      }

      res.json({ success: true, message: msg });
    } catch (err) {
      next(err);
    }
  },
);

// ════════════════════════════════════════════
//  FAVOURITES
// ════════════════════════════════════════════

// GET /api/customers/favourites — get all saved plots for customer
router.get("/favourites", customerAuth, async (req, res, next) => {
  try {
    const favs = await Favourite.find({ customer: req.customerId })
      .populate({
        path: "property",
        populate: {
          path: "owner",
          select: "name accountStatus isAadhaarVerified",
        },
      })
      .sort({ createdAt: -1 });

    const properties = favs
      .filter((f) => f.property && f.property.status === "active")
      .map((f) => ({ ...f.property.toObject(), isFavourited: true }));

    res.json({ success: true, count: properties.length, properties });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/favourites/:plotId — add to favourites
router.post("/favourites/:plotId", customerAuth, async (req, res, next) => {
  try {
    const exists = await Favourite.findOne({
      customer: req.customerId,
      property: req.params.plotId,
    });
    if (exists)
      return res.json({
        success: true,
        favourited: true,
        message: "Already in favourites",
      });

    await Favourite.create({
      customer: req.customerId,
      property: req.params.plotId,
    });
    res.json({
      success: true,
      favourited: true,
      message: "Added to favourites",
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/favourites/:plotId — remove from favourites
router.delete("/favourites/:plotId", customerAuth, async (req, res, next) => {
  try {
    await Favourite.findOneAndDelete({
      customer: req.customerId,
      property: req.params.plotId,
    });
    res.json({
      success: true,
      favourited: false,
      message: "Removed from favourites",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/favourites/check/:plotId — check if a plot is favourited
router.get(
  "/favourites/check/:plotId",
  customerAuth,
  async (req, res, next) => {
    try {
      const exists = await Favourite.findOne({
        customer: req.customerId,
        property: req.params.plotId,
      });
      res.json({ success: true, favourited: !!exists });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/customers/favourites/ids — get all favourited plot IDs (for bulk heart state)
router.get("/favourites/ids", customerAuth, async (req, res, next) => {
  try {
    const favs = await Favourite.find({ customer: req.customerId }).select(
      "property",
    );
    const ids = favs.map((f) => f.property.toString());
    res.json({ success: true, ids });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
//  SUPPORT  /  ASK A PROBLEM
// ════════════════════════════════════════════

// Customer submits a problem
router.post("/support", customerAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim())
      return res
        .status(400)
        .json({ success: false, message: "Please describe your problem" });

    const customer = await Customer.findById(req.customerId);
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    const ticket = await SupportTicket.create({
      userType: "customer",
      userId: customer._id,
      name: customer.name,
      email: customer.email,
      message: message.trim(),
    });
    res.status(201).json({
      success: true,
      message: "Your problem has been sent to our team",
      ticket,
    });
  } catch (err) {
    next(err);
  }
});

// Owner submits a problem
router.post("/owner-support", ownerAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim())
      return res
        .status(400)
        .json({ success: false, message: "Please describe your problem" });

    const owner = await Owner.findById(req.ownerId);
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    const ticket = await SupportTicket.create({
      userType: "owner",
      userId: owner._id,
      name: owner.name,
      email: owner.email,
      message: message.trim(),
    });
    res.status(201).json({
      success: true,
      message: "Your problem has been sent to our team",
      ticket,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
