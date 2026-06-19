const express = require("express");
const router = express.Router();
const Visit = require("../models/Visit");
const Property = require("../models/Property");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

// All routes here are OWNER-only.
router.use(protect);

// GET /api/visits  — all visits for the logged-in owner
router.get("/", async (req, res, next) => {
  try {
    // Visits store the owner directly, so query by it.
    const filter = { owner: req.owner._id };
    if (req.query.status) filter.status = req.query.status;
    const visits = await Visit.find(filter)
      .populate("property", "propertyName location propertyType photos")
      .populate("customer", "name email phone")
      .sort({ visitDate: 1, createdAt: -1 });
    res.json({ success: true, count: visits.length, visits });
  } catch (err) {
    next(err);
  }
});

// GET /api/visits/:id
router.get("/:id", async (req, res, next) => {
  try {
    const visit = await Visit.findOne({
      _id: req.params.id,
      owner: req.owner._id,
    })
      .populate("property", "propertyName location propertyType photos")
      .populate("customer", "name email phone");
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });
    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id/confirm — owner confirms the slot on the table
router.patch("/:id/confirm", async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      {
        status: "confirmed",
        awaitingFrom: null,
        ownerNote: req.body.ownerNote || "",
      },
      { new: true },
    ).populate("property", "propertyName");
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });
    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id/cancel
router.patch("/:id/cancel", async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      {
        status: "cancelled",
        awaitingFrom: null,
        ownerNote: req.body.reason || "",
      },
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

// PATCH /api/visits/:id/complete
router.patch("/:id/complete", async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      { status: "completed", awaitingFrom: null },
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

// PATCH /api/visits/:id/reschedule — owner PROPOSES a new slot -> customer's turn
router.patch("/:id/reschedule", async (req, res, next) => {
  try {
    const { newDate, newTime, reason } = req.body;
    if (!newDate || !newTime)
      return res
        .status(400)
        .json({ success: false, message: "newDate and newTime required" });

    const visit = await Visit.findOne({
      _id: req.params.id,
      owner: req.owner._id,
    });
    if (!visit)
      return res
        .status(404)
        .json({ success: false, message: "Visit not found" });

    visit.visitDate = new Date(newDate);
    visit.visitTime = newTime;
    visit.status = "rescheduled";
    visit.awaitingFrom = "customer";
    visit.proposedBy = "owner";
    visit.rescheduleDate = new Date(newDate);
    visit.rescheduleTime = newTime;
    visit.rescheduleReason = reason || "";
    visit.proposals.push({
      by: "owner",
      date: new Date(newDate),
      time: newTime,
      note: reason || "",
    });
    await visit.save();

    res.json({ success: true, visit });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
