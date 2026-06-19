const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

// ── Create upload directories at startup ──────────────────────
const uploadDirs = [
  path.join(__dirname, "uploads"),
  path.join(__dirname, "uploads", "photos"),
  path.join(__dirname, "uploads", "documents"),
];
uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created: ${dir}`);
  }
});

// ── Middleware ────────────────────────────────────────────────
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  }),
);

// Handle CORS preflight for all routes (important for multipart uploads from Flutter Web)
app.options("*", cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("dev"));

// ── Serve local uploads with correct CORS headers ─────────────
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  },
  express.static(path.join(__dirname, "uploads")),
);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/properties", require("./routes/properties"));
app.use("/api/visits", require("./routes/visits"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/admin", require("./routes/admin"));

// Pre-load models
require("./models/Chat");
require("./models/Message");
require("./models/Favourite");

app.use("/api/customers", require("./routes/customers"));
app.use("/api/locations", require("./routes/locations"));

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uploads: fs.existsSync(path.join(__dirname, "uploads"))
      ? "ready"
      : "missing",
  });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File too large. Max 10MB for documents, 5MB for photos.",
    });
  }
  if (
    err.message &&
    (err.message.includes("Only") || err.message.includes("allowed"))
  ) {
    return res.status(415).json({ success: false, message: err.message });
  }
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Server error",
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// ── One-time self-healing migration: merge per-plot chats into per-owner ──
// Safe to run on every boot. Drops the old (customer,owner,property) unique
// index, merges any duplicate (customer,owner) threads into the oldest one,
// then builds the new (customer,owner) unique index.
async function migrateChatsToPerOwner() {
  const Chat = mongoose.model("Chat");
  const Message = mongoose.model("Message");
  const coll = Chat.collection;

  try {
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if (
        idx.key &&
        idx.key.customer === 1 &&
        idx.key.owner === 1 &&
        idx.key.property === 1
      ) {
        await coll.dropIndex(idx.name);
        console.log(`🧹 Dropped old chat index: ${idx.name}`);
      }
    }
  } catch (e) {
    console.warn("Chat index cleanup skipped:", e.message);
  }

  try {
    const dups = await Chat.aggregate([
      {
        $group: {
          _id: { customer: "$customer", owner: "$owner" },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    for (const group of dups) {
      const chats = await Chat.find({ _id: { $in: group.ids } }).sort({
        createdAt: 1,
      });
      const keep = chats[0];
      const removeIds = chats.slice(1).map((c) => c._id);

      // Move every message from the duplicate threads onto the kept one.
      await Message.updateMany(
        { chat: { $in: removeIds } },
        { $set: { chat: keep._id } },
      );

      const newest = chats.reduce(
        (a, b) => (b.lastMessageAt > a.lastMessageAt ? b : a),
        keep,
      );
      const unreadByOwner = chats.reduce(
        (s, c) => s + (c.unreadByOwner || 0),
        0,
      );
      const unreadByCustomer = chats.reduce(
        (s, c) => s + (c.unreadByCustomer || 0),
        0,
      );

      await Chat.findByIdAndUpdate(keep._id, {
        lastMessage: newest.lastMessage,
        lastMessageAt: newest.lastMessageAt,
        property: newest.property,
        unreadByOwner,
        unreadByCustomer,
      });
      await Chat.deleteMany({ _id: { $in: removeIds } });
      console.log(
        `🔀 Merged ${removeIds.length} duplicate chat(s) into ${keep._id}`,
      );
    }
  } catch (e) {
    console.warn("Chat merge skipped:", e.message);
  }

  try {
    await Chat.syncIndexes();
    console.log("✅ Chat indexes synced (one thread per customer-owner)");
  } catch (e) {
    console.warn("Chat syncIndexes warning:", e.message);
  }
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");
    await migrateChatsToPerOwner();
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
