const Visit        = require("../models/Visit");
const Notification = require("../models/Notification");

// @GET /api/visits
exports.getVisits = async (req, res, next) => {
  try {
    // Auto-refresh categories
    const now        = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

    await Visit.updateMany({ owner: req.owner._id, visitDate: { $lt: todayStart } }, { visitCategory: "past" });
    await Visit.updateMany({ owner: req.owner._id, visitDate: { $gte: todayStart, $lte: todayEnd } }, { visitCategory: "today" });
    await Visit.updateMany({ owner: req.owner._id, visitDate: { $gt: todayEnd } }, { visitCategory: "upcoming" });

    const filter = { owner: req.owner._id };
    if (req.query.category) filter.visitCategory = req.query.category;
    if (req.query.status)   filter.status        = req.query.status;

    const visits = await Visit.find(filter)
      .populate("property", "propertyName propertyType location")
      .sort({ visitDate: 1 });

    res.status(200).json({ success: true, count: visits.length, visits });
  } catch (err) { next(err); }
};

// @GET /api/visits/:id
exports.getVisit = async (req, res, next) => {
  try {
    const visit = await Visit.findOne({ _id: req.params.id, owner: req.owner._id })
      .populate("property", "propertyName propertyType location");

    if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });
    res.status(200).json({ success: true, visit });
  } catch (err) { next(err); }
};

// @POST /api/visits
exports.createVisit = async (req, res, next) => {
  try {
    const { propertyId, visitorName, visitorPhone, visitorEmail, requirement, visitDate, visitTime } = req.body;

    if (!propertyId || !visitorName || !visitorPhone || !visitDate || !visitTime)
      return res.status(400).json({ success: false, message: "propertyId, visitorName, visitorPhone, visitDate and visitTime are required" });

    const visit = await Visit.create({
      property: propertyId,
      owner:    req.owner._id,
      visitorName, visitorPhone, visitorEmail, requirement,
      visitDate: new Date(visitDate),
      visitTime,
    });

    await Notification.create({
      owner: req.owner._id,
      title: "New Visit Scheduled",
      message: `${visitorName} scheduled a visit on ${visitDate} at ${visitTime}.`,
      type: "visit",
    });

    res.status(201).json({ success: true, message: "Visit created", visit });
  } catch (err) { next(err); }
};

// @PATCH /api/visits/:id/confirm
exports.confirmVisit = async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      { status: "confirmed" },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });

    await Notification.create({
      owner: req.owner._id,
      title: "Visit Confirmed",
      message: `Visit with ${visit.visitorName} confirmed.`,
      type: "visit",
    });

    res.status(200).json({ success: true, message: "Visit confirmed", visit });
  } catch (err) { next(err); }
};

// @PATCH /api/visits/:id/reschedule
exports.rescheduleVisit = async (req, res, next) => {
  try {
    const { newDate, newTime, reason } = req.body;
    if (!newDate || !newTime)
      return res.status(400).json({ success: false, message: "newDate and newTime are required" });

    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      { status: "rescheduled", rescheduledDate: new Date(newDate), rescheduledTime: newTime, rescheduleReason: reason || "" },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });

    res.status(200).json({ success: true, message: "Visit rescheduled", visit });
  } catch (err) { next(err); }
};

// @PATCH /api/visits/:id/cancel
exports.cancelVisit = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason)
      return res.status(400).json({ success: false, message: "Cancellation reason is required" });

    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      { status: "cancelled", cancelReason: reason },
      { new: true }
    );
    if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });

    res.status(200).json({ success: true, message: "Visit cancelled", visit });
  } catch (err) { next(err); }
};
