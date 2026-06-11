const express = require("express");
const router = express.Router();
const Property = require("../models/Property");
const Owner = require("../models/Owner");
const Notification = require("../models/Notification");

// ── Admin auth middleware ─────────────────────────────────────
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
};

// ── POST /api/admin/login  (public) ──────────────────────────
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Safety check — if admin env vars are missing, give a clear error
  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.ADMIN_SECRET
  ) {
    console.error(
      "❌ ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SECRET are missing from .env",
    );
    return res.status(500).json({
      success: false,
      message:
        "Admin credentials not configured. Add ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SECRET to .env",
    });
  }

  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = password === process.env.ADMIN_PASSWORD;

  if (validUser && validPass) {
    console.log(`✅ Admin login successful: ${username}`);
    return res.json({
      success: true,
      token: process.env.ADMIN_SECRET,
      username,
    });
  }

  console.warn(`⚠️  Failed admin login attempt — username: "${username}"`);
  return res
    .status(401)
    .json({ success: false, message: "Invalid credentials" });
});

router.use(adminAuth);

// ── GET /api/admin/stats ──────────────────────────────────────
router.get("/stats", async (req, res, next) => {
  try {
    const [
      totalProperties,
      active,
      underReview,
      inactive,
      rejected,
      suspended,
      verified,
      totalOwners,
      pgCount,
      guestCount,
      plotCount,
    ] = await Promise.all([
      Property.countDocuments(),
      Property.countDocuments({ status: "active" }),
      Property.countDocuments({ status: "under_review" }),
      Property.countDocuments({ status: "inactive" }),
      Property.countDocuments({ status: "rejected" }),
      Property.countDocuments({ status: "suspended" }),
      Property.countDocuments({ isVerified: true }),
      Owner.countDocuments(),
      Property.countDocuments({ propertyType: "pg" }),
      Property.countDocuments({ propertyType: "guest" }),
      Property.countDocuments({ propertyType: "plot" }),
    ]);

    let totalVisits = 0;
    try {
      const Visit = require("../models/Visit");
      totalVisits = await Visit.countDocuments();
    } catch (_) {}

    res.json({
      success: true,
      stats: {
        totalProperties,
        totalOwners,
        totalVisits,
        byStatus: {
          active,
          under_review: underReview,
          inactive,
          rejected,
          suspended,
        },
        byType: { pg: pgCount, guest: guestCount, plot: plotCount },
        verification: { verified, pending: totalProperties - verified },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/properties ─────────────────────────────────
router.get("/properties", async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.type) {
      filter.propertyType = req.query.type;
    }
    if (req.query.pendingReview === "true") {
      filter.pendingAdminReview = true;
    }
    if (req.query.search) {
      filter.$or = [
        { propertyName: { $regex: req.query.search, $options: "i" } },
        { location: { $regex: req.query.search, $options: "i" } },
      ];
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate(
          "owner",
          "name email phone accountStatus isAadhaarVerified createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
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

// ── GET /api/admin/properties/:id  (full detail) ─────────────
router.get("/properties/:id", async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id).populate(
      "owner",
      "name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto",
    );
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    res.json({ success: true, property });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/properties/:id/verify ───────────────────
// Verify ✅  or  Reject ❌
router.patch("/properties/:id/verify", async (req, res, next) => {
  try {
    const { isVerified, status, rejectionNote } = req.body;
    const allowed = [
      "active",
      "rejected",
      "under_review",
      "inactive",
      "suspended",
    ];
    if (status && !allowed.includes(status))
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });

    const update = {};
    if (typeof isVerified === "boolean") {
      update.isVerified = isVerified;
    }
    if (status) {
      update.status = status;
    }
    if (rejectionNote !== undefined) {
      update.rejectionNote = rejectionNote;
    }
    update.pendingAdminReview = false; // admin has now acted → clear re-review flag

    const property = await Property.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).populate(
      "owner",
      "name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto",
    );

    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      if (isVerified === true) {
        await Notification.create({
          owner: ownerId,
          title: "Property Verified! ✅",
          message: `"${property.propertyName}" has been legally verified and is now live on the platform.`,
          type: "listing",
        });
      } else if (status === "rejected") {
        await Notification.create({
          owner: ownerId,
          title: "Property Rejected ❌",
          message: `"${property.propertyName}" was rejected by admin. ${rejectionNote ? "Reason: " + rejectionNote : "Please contact support for details."}`,
          type: "listing",
        });
      }
    }

    res.json({ success: true, message: `Property updated`, property });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/properties/:id/suspend ──────────────────
// Suspend a property and notify the owner with reason
router.patch("/properties/:id/suspend", async (req, res, next) => {
  try {
    const { suspensionReason } = req.body;
    if (!suspensionReason || !suspensionReason.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Suspension reason is required" });
    }

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        status: "suspended",
        isVerified: false,
        rejectionNote: suspensionReason.trim(),
        pendingAdminReview: false, // admin acted (re-suspended with a reason)
      },
      { new: true },
    ).populate(
      "owner",
      "name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto",
    );

    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    // ✅ Notify owner immediately with the suspension reason
    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      await Notification.create({
        owner: ownerId,
        title: "⚠️ Property Suspended",
        message: `Your property "${property.propertyName}" has been suspended by the admin.\n\nReason: ${suspensionReason.trim()}\n\nPlease contact support or make the necessary changes and resubmit.`,
        type: "listing",
      });
    }

    res.json({
      success: true,
      message: "Property suspended and owner notified",
      property,
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/properties/:id/reinstate ─────────────────
// Reinstate a suspended/rejected property back to under_review
// so the owner can fix issues and resubmit
router.patch("/properties/:id/reinstate", async (req, res, next) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        status: "under_review",
        isVerified: false,
        rejectionNote: "",
        pendingAdminReview: false, // admin acted (reinstated for owner to fix)
      },
      { new: true },
    ).populate(
      "owner",
      "name email phone accountStatus isAadhaarVerified isEmailVerified createdAt profilePhoto",
    );

    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    // Notify owner
    const ownerId = property.owner?._id || property.owner;
    if (ownerId) {
      await Notification.create({
        owner: ownerId,
        title: "🔄 Property Reinstated",
        message: `Your property "${property.propertyName}" has been reinstated by the admin and is back under review. You may now update your details, photos, or documents and resubmit.`,
        type: "listing",
      });
    }

    res.json({
      success: true,
      message: "Property reinstated — owner notified",
      property,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/admin/properties/:id ─────────────────────────
router.delete("/properties/:id", async (req, res, next) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    // Notify owner
    const ownerId = property.owner;
    if (ownerId) {
      await Notification.create({
        owner: ownerId,
        title: "🗑️ Property Removed",
        message: `Your property "${property.propertyName}" has been permanently removed from the platform by the admin.`,
        type: "listing",
      });
    }

    res.json({ success: true, message: "Property deleted and owner notified" });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/review-alerts ─────────────────────────────
// Properties where suspended/rejected owner has uploaded new files
// Admin needs to re-review these
router.get("/review-alerts", async (req, res, next) => {
  try {
    const alerts = await Property.find({ pendingAdminReview: true })
      .populate("owner", "name email phone")
      .sort({ lastOwnerUpdateAt: -1 });

    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/properties/:id/clear-review ─────────────
// Mark pendingAdminReview as false after admin has reviewed
router.patch("/properties/:id/clear-review", async (req, res, next) => {
  try {
    await Property.findByIdAndUpdate(req.params.id, {
      pendingAdminReview: false,
    });
    res.json({ success: true, message: "Review flag cleared" });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/owners ─────────────────────────────────────
router.get("/owners", async (req, res, next) => {
  try {
    // Attach property count to each owner
    const owners = await Owner.find().sort({ createdAt: -1 }).lean();
    const counts = await Property.aggregate([
      { $group: { _id: "$owner", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });
    const enriched = owners.map((o) => ({
      ...o,
      propertyCount: countMap[o._id.toString()] || 0,
    }));
    res.json({ success: true, count: enriched.length, owners: enriched });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/visits ─────────────────────────────────────
router.get("/visits", async (req, res, next) => {
  try {
    let visits = [];
    try {
      const Visit = require("../models/Visit");
      visits = await Visit.find()
        .populate("property", "propertyName location propertyType")
        .populate("owner", "name email")
        .sort({ createdAt: -1 });
    } catch (_) {}
    res.json({ success: true, count: visits.length, visits });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

// ── GET /api/admin/notifications ─────────────────────────────
// Admin panel polls this every 20s for new owner re-upload alerts
router.get("/notifications", async (req, res, next) => {
  try {
    const Notification = require("../models/Notification");
    const notifications = await Notification.find({ forAdmin: true })
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .limit(20);

    const unread = notifications.filter((n) => !n.isRead).length;
    res.json({
      success: true,
      count: notifications.length,
      unread,
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/notifications/read-all ───────────────────
router.patch("/notifications/read-all", async (req, res, next) => {
  try {
    const Notification = require("../models/Notification");
    await Notification.updateMany(
      { forAdmin: true, isRead: false },
      { isRead: true },
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
