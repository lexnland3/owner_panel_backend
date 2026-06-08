const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ── Detect whether Cloudinary is configured ───────────────────
const cloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME.trim() !== "" &&
  process.env.CLOUDINARY_CLOUD_NAME !== "add_later" &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY.trim() !== "" &&
  process.env.CLOUDINARY_API_KEY !== "add_later";

let cloudinary = null;

if (cloudinaryConfigured) {
  // cloudinary v2 syntax
  const { v2: cloudinaryV2 } = require("cloudinary");
  cloudinaryV2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  cloudinary = cloudinaryV2;
  console.log("☁️  Cloudinary storage enabled (direct v2 upload_stream)");
} else {
  console.log("💾 Local disk storage enabled (upload to /uploads/)");
}

// ── Ensure upload directories exist ──────────────────────────
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const uniqueId = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

// ── Local disk storage ─────────────────────────────────────────
const makeLocalStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, "..", "uploads", folder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${uniqueId()}${ext}`);
    },
  });

// ── Custom Cloudinary storage engine (no multer-storage-cloudinary) ──
// Streams the uploaded file straight to Cloudinary using the v2 SDK,
// then sets file.path = secure_url so all downstream code keeps working.
function makeCloudinaryStorage({ subfolder, resourceType, transformation }) {
  return {
    _handleFile(req, file, cb) {
      const folder = `lexnland/${subfolder}/${req.owner?._id || "general"}`;
      const options = {
        folder,
        resource_type: resourceType || "image",
        public_id: uniqueId(),
      };
      if (transformation) options.transformation = transformation;

      console.log(
        `☁️  Uploading to Cloudinary → folder=${folder} name=${file.originalname} mime=${file.mimetype}`,
      );

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (err, result) => {
          if (err) {
            console.error("❌ Cloudinary upload error:", err.message || err);
            return cb(err);
          }
          console.log("✅ Cloudinary OK →", result.secure_url);
          cb(null, {
            path: result.secure_url, // ← downstream code reads file.path
            filename: result.public_id,
            size: result.bytes,
            mimetype: file.mimetype,
          });
        },
      );

      file.stream.on("error", (e) => {
        console.error("❌ File stream error:", e.message || e);
        cb(e);
      });
      file.stream.pipe(uploadStream);
    },
    _removeFile(req, file, cb) {
      if (!file.filename) return cb(null);
      cloudinary.uploader
        .destroy(file.filename)
        .then(() => cb(null))
        .catch(cb);
    },
  };
}

// ── File filters ───────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  const allowedMime = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname || "").toLowerCase();
  const genericMime =
    !file.mimetype || file.mimetype === "application/octet-stream";
  // Accept by MIME, or — when the browser sends a generic type (common on
  // Flutter Web multipart) — fall back to the filename extension. Cloudinary
  // still validates the actual bytes, so this is safe.
  if (
    allowedMime.includes(file.mimetype) ||
    (genericMime && allowedExt.includes(ext))
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Only JPG, PNG, WEBP allowed.`,
      ),
    );
  }
};

const docFilter = (req, file, cb) => {
  const allowedMime = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const ext = path.extname(file.originalname || "").toLowerCase();
  const genericMime =
    !file.mimetype || file.mimetype === "application/octet-stream";
  if (
    allowedMime.includes(file.mimetype) ||
    (genericMime && allowedExt.includes(ext))
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Only JPG, PNG, PDF allowed.`,
      ),
    );
  }
};

// ── Multer instances ───────────────────────────────────────────
const uploadPhotos = multer({
  storage: cloudinaryConfigured
    ? makeCloudinaryStorage({
        subfolder: "photos",
        resourceType: "image",
        transformation: [
          { width: 1200, height: 900, crop: "limit", quality: "auto:good" },
        ],
      })
    : makeLocalStorage("photos"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
});

const uploadDocuments = multer({
  storage: cloudinaryConfigured
    ? makeCloudinaryStorage({ subfolder: "documents", resourceType: "auto" })
    : makeLocalStorage("documents"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: docFilter,
});

// ── Audio (voice messages) ─────────────────────────────────────
const audioFilter = (req, file, cb) => {
  const allowedExt = [".webm", ".ogg", ".mp3", ".m4a", ".aac", ".wav", ".mp4"];
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = file.mimetype || "";
  const okByMime = mime.startsWith("audio/") || mime === "video/webm";
  const genericMime = !mime || mime === "application/octet-stream";
  if (okByMime || (genericMime && allowedExt.includes(ext))) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid audio type: ${file.mimetype}`));
  }
};

// Cloudinary stores audio under the "video" resource type.
const uploadAudio = multer({
  storage: cloudinaryConfigured
    ? makeCloudinaryStorage({ subfolder: "audio", resourceType: "video" })
    : makeLocalStorage("audio"),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: audioFilter,
});

// ── Convert multer file → URL string ──────────────────────────
// Cloudinary: file.path is the full HTTPS secure_url
// Local:      file.path is the absolute disk path → relative web URL
const fileToUrl = (file) => {
  if (!file) return null;
  if (file.path && file.path.startsWith("http")) return file.path;
  const normalized = file.path.replace(/\\/g, "/");
  const idx = normalized.indexOf("/uploads/");
  if (idx !== -1) return normalized.slice(idx);
  return `/uploads/${path.basename(file.path)}`;
};

// ── Delete helper ──────────────────────────────────────────────
const deleteFile = async (urlOrPublicId) => {
  if (!urlOrPublicId) return;
  if (cloudinaryConfigured && cloudinary) {
    try {
      // Audio is stored under the "video" resource type on Cloudinary.
      const isVideo = /\/video\/upload\//.test(urlOrPublicId);
      const match = urlOrPublicId.match(
        /\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/,
      );
      if (match) {
        await cloudinary.uploader.destroy(match[1], {
          resource_type: isVideo ? "video" : "image",
        });
      }
    } catch (_) {}
  } else {
    try {
      const absPath = urlOrPublicId.startsWith("/")
        ? path.join(__dirname, "..", urlOrPublicId)
        : urlOrPublicId;
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (_) {}
  }
};

module.exports = {
  cloudinary,
  uploadPhotos,
  uploadDocuments,
  uploadAudio,
  fileToUrl,
  deleteImage: deleteFile, // backwards-compat name
  cloudinaryConfigured,
};
