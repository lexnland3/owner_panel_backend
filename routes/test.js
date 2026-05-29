// ─────────────────────────────────────────────────────────────
// TEST ROUTES — use these to verify everything works
// Remove this file before going to production
// ─────────────────────────────────────────────────────────────
const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const Owner    = require("../models/Owner");
const Property = require("../models/Property");
const { protect } = require("../middleware/auth");

// GET /api/test/health — Check server + DB
router.get("/health", async (req, res) => {
  const dbState = ["disconnected","connected","connecting","disconnecting"];
  res.json({
    success: true,
    server:  "running",
    database: {
      status:  dbState[mongoose.connection.readyState],
      name:    mongoose.connection.name,
      host:    mongoose.connection.host,
    },
  });
});

// POST /api/test/register — Quick register without validation
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const owner = await Owner.create({ name, email, phone, password });
    res.json({ success: true, message: "Owner created", ownerId: owner._id });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/test/property — Create property with token (test all 3 types)
router.post("/property", protect, async (req, res) => {
  try {
    console.log("TEST: body =", req.body);

    const property = await Property.create({
      owner:        req.owner._id,
      propertyType: req.body.propertyType  || "plot",
      propertyName: req.body.propertyName  || "Test Property",
      location:     req.body.location      || "Test Location",
      localLandmark:req.body.localLandmark || "",
      plotDetails: req.body.propertyType === "plot" ? {
        plotType:      req.body.plotType      || "Residential",
        facing:        req.body.facing        || "East",
        plotSize:      Number(req.body.plotSize)    || 1500,
        totalPrice:    Number(req.body.totalPrice)  || 75000,
        pricePerSqft:  Math.round((Number(req.body.totalPrice) || 75000) / (Number(req.body.plotSize) || 1500)),
        plotDimensions:{ length: 30, width: 50 },
        facilities:    ["Road Access","Water Supply"],
        description:   req.body.description || "",
      } : undefined,
      pgDetails: req.body.propertyType === "pg" ? {
        availableFor:  ["boys","girls"],
        totalRooms:    Number(req.body.totalRooms) || 5,
        occupancyType: "single",
        roomType:      "sharing",
        sharingPricing:{ singleRoom:{ price:5000, deposit:2000 } },
        facilities:    ["WiFi","Food"],
      } : undefined,
      guestRoomDetails: req.body.propertyType === "guest" ? {
        totalRooms: Number(req.body.totalRooms) || 5,
        acRooms:    3,
        nonAcRooms: 2,
        pricing:    { singleRoom:{ price:1999, deposit:500 } },
        facilities: ["WiFi","Parking"],
      } : undefined,
    });

    res.json({ success: true, message: "✅ Property saved to MongoDB!", property });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, stack: err.stack });
  }
});

// GET /api/test/properties — List all properties in DB
router.get("/properties", protect, async (req, res) => {
  try {
    const props = await Property.find({ owner: req.owner._id });
    res.json({ success: true, count: props.length, properties: props });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
