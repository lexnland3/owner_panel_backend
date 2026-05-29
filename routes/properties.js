const express = require('express');
const router  = express.Router();
const {
  createProperty, getMyProperties, getProperty,
  updateProperty, updatePropertyStatus, deleteProperty,
  uploadDocuments, getDashboardStats, uploadPropertyPhotos,
} = require('../controllers/propertyController');
const { protect }        = require('../middleware/auth');
const { uploadPhotos, uploadDocuments: uploadDocs } = require('../config/cloudinary');

router.use(protect);

// Stats
router.get('/dashboard', getDashboardStats);

// CRUD
router.route('/')
  .get(getMyProperties)
  .post(createProperty);

router.route('/:id')
  .get(getProperty)
  .put(updateProperty)
  .delete(deleteProperty);

router.patch('/:id/status', updatePropertyStatus);

// ── Upload property photos ── up to 10 images
router.post(
  '/:id/photos',
  uploadPhotos.array('photos', 10),
  uploadPropertyPhotos
);

// ── Upload documents (registry, NOC, aadhaar) ──
router.post(
  '/:id/documents',
  uploadDocs.fields([
    { name: 'registry', maxCount: 1 },
    { name: 'noc',      maxCount: 1 },
  ]),
  uploadDocuments
);

module.exports = router;
