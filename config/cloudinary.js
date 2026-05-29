const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Detect whether Cloudinary is configured ───────────────────
const cloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME.trim() !== '' &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'add_later' &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY.trim() !== '' &&
  process.env.CLOUDINARY_API_KEY !== 'add_later';

let cloudinary = null;

if (cloudinaryConfigured) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('☁️  Cloudinary storage enabled');
} else {
  console.log('💾 Local disk storage enabled (set CLOUDINARY_* in .env to use cloud)');
}

// ── Local disk storage fallback ───────────────────────────────
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
};

const localPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'photos');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const localDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'documents');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

// ── Cloudinary storage (used when configured) ─────────────────
let cloudinaryPhotoStorage = null;
let cloudinaryDocStorage   = null;

if (cloudinaryConfigured) {
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinaryPhotoStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder:           `lexnland/properties/${req.owner?._id || 'general'}`,
      allowed_formats:  ['jpg', 'jpeg', 'png', 'webp'],
      transformation:   [{ width: 1200, height: 900, crop: 'limit', quality: 'auto' }],
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    }),
  });

  cloudinaryDocStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder:          `lexnland/documents/${req.owner?._id || 'general'}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type:   'auto',
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    }),
  });
}

// ── Multer instances ──────────────────────────────────────────
const uploadPhotos = multer({
  storage: cloudinaryConfigured ? cloudinaryPhotoStorage : localPhotoStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    const allowedExt  = ['.jpg','.jpeg','.png','.webp','.gif'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Accept if MIME matches OR if extension matches (browser may send octet-stream)
    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP images allowed'));
    }
  },
});

const uploadDocuments = multer({
  storage: cloudinaryConfigured ? cloudinaryDocStorage : localDocStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, PDF allowed for documents'));
    }
  },
});

// ── Local audio storage ──────────────────────────────────────
const localAudioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'audio');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.webm';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

let cloudinaryAudioStorage = null;
if (cloudinaryConfigured) {
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  cloudinaryAudioStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder:        `lexnland/audio/${req.owner?._id || req.customerId || 'general'}`,
      resource_type: 'video', // Cloudinary uses 'video' for audio files
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    }),
  });
}

const uploadAudio = multer({
  storage: cloudinaryConfigured ? cloudinaryAudioStorage : localAudioStorage,
  limits:  { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowedMime = ['audio/webm','audio/ogg','audio/mp4','audio/mpeg',
                         'audio/wav','audio/x-wav','video/webm','application/octet-stream'];
    const allowedExt  = ['.webm','.ogg','.mp4','.mp3','.wav','.m4a'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files allowed'));
    }
  },
});

// ── Delete helper ─────────────────────────────────────────────
const deleteImage = async (publicIdOrPath) => {
  if (cloudinaryConfigured && cloudinary) {
    try { await cloudinary.uploader.destroy(publicIdOrPath); } catch (_) {}
  } else {
    try { fs.unlinkSync(publicIdOrPath); } catch (_) {}
  }
};

// ── Serve local uploads via Express (call in server.js) ───────
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

module.exports = { cloudinary, uploadPhotos, uploadDocuments, uploadAudio, deleteImage, cloudinaryConfigured };
