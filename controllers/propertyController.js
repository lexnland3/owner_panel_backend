const Property     = require('../models/Property');
const Notification = require('../models/Notification');
const path         = require('path');
const { cloudinaryConfigured, fileToUrl } = require('../config/cloudinary');

// ── Helper: convert multer file to storable URL/path ─────────
const fileUrl = (file) => {
  if (cloudinaryConfigured) {
    // Cloudinary returns the full URL in file.path
    return file.path;
  }
  // Local storage: convert absolute path to a relative URL
  // file.path = /absolute/.../uploads/photos/filename.jpg
  // We want:    /uploads/photos/filename.jpg
  const rel = file.path.replace(/\\/g, '/');
  const idx = rel.indexOf('/uploads/');
  return idx !== -1 ? rel.slice(idx) : `/uploads/${path.basename(file.path)}`;
};

// ── Helper: build type-specific details ──────────────────────
const buildTypeDetails = (type, body) => {
  if (type === 'pg') {
    return {
      availableFor:  Array.isArray(body.availableFor) ? body.availableFor : (body.availableFor ? [body.availableFor] : []),
      totalRooms:    Number(body.totalRooms)  || 0,
      acRooms:       Number(body.acRooms)     || 0,
      nonAcRooms:    Number(body.nonAcRooms)  || 0,
      occupancyType: body.occupancyType || 'any',
      roomType:      body.roomType      || 'sharing',
      sharingPricing: {
        singleRoom: { price: Number(body.singlePrice)  || 0, deposit: Number(body.singleDeposit)  || 0 },
        doubleRoom: { price: Number(body.doublePrice)  || 0, deposit: Number(body.doubleDeposit)  || 0 },
        tripleRoom: { price: Number(body.triplePrice)  || 0, deposit: Number(body.tripleDeposit)  || 0 },
      },
      groupPricing: {
        twoPersons:   { price: Number(body.twoPersonsPrice)   || 0, deposit: Number(body.twoPersonsDeposit)   || 0 },
        threePersons: { price: Number(body.threePersonsPrice) || 0, deposit: Number(body.threePersonsDeposit) || 0 },
        fourPersons:  { price: Number(body.fourPersonsPrice)  || 0, deposit: Number(body.fourPersonsDeposit)  || 0 },
      },
      facilities:     Array.isArray(body.facilities) ? body.facilities : [],
      commonKitchen:  body.commonKitchen  === true || body.commonKitchen  === 'true',
      privateKitchen: body.privateKitchen === true || body.privateKitchen === 'true',
      description:    body.description || '',
    };
  }

  if (type === 'guest') {
    return {
      totalRooms: Number(body.totalRooms) || 0,
      acRooms:    Number(body.acRooms)    || 0,
      nonAcRooms: Number(body.nonAcRooms) || 0,
      pricing: {
        singleRoom: { price: Number(body.singlePrice)  || 0, deposit: Number(body.singleDeposit) || 0 },
        doubleRoom: { price: Number(body.doublePrice)  || 0, deposit: Number(body.doubleDeposit) || 0 },
        familyRoom: { price: Number(body.familyPrice)  || 0, deposit: Number(body.familyDeposit) || 0 },
      },
      facilities:     Array.isArray(body.facilities) ? body.facilities : [],
      commonKitchen:  body.commonKitchen  === true || body.commonKitchen  === 'true',
      privateKitchen: body.privateKitchen === true || body.privateKitchen === 'true',
      description:    body.description || '',
    };
  }

  if (type === 'plot') {
    const totalPrice = Number(body.totalPrice) || 0;
    const plotSize   = Number(body.plotSize)   || 0;
    return {
      plotId:       body.plotId   || null,
      plotType:     body.plotType || null,
      facing:       body.facing   || null,
      plotSize,
      plotDimensions: {
        length: Number(body.plotLength) || 0,
        width:  Number(body.plotWidth)  || 0,
      },
      totalPrice,
      pricePerSqft:  plotSize > 0 ? Math.round(totalPrice / plotSize) : 0,
      ownershipType: body.ownershipType || null,
      facilities:    Array.isArray(body.facilities) ? body.facilities : [],
      description:   body.description || '',
    };
  }
  return null;
};

// ── POST /api/properties ──────────────────────────────────────
exports.createProperty = async (req, res, next) => {
  try {
    console.log('📥 Create property:', req.body.propertyType, req.body.propertyName);
    const { propertyType, propertyName, location, localLandmark } = req.body;

    if (!propertyType || !propertyName || !location) {
      return res.status(400).json({ success: false, message: 'propertyType, propertyName and location are required' });
    }

    const validTypes = ['pg', 'guest', 'plot'];
    if (!validTypes.includes(propertyType)) {
      return res.status(400).json({ success: false, message: 'propertyType must be pg, guest or plot' });
    }

    const propertyData = {
      owner:         req.owner._id,
      propertyType,
      propertyName:  propertyName.trim(),
      location:      location.trim(),
      localLandmark: (localLandmark || '').trim(),
      photos:           [],
      registryDocument: null,
      nocDocument:      null,
    };

    const details = buildTypeDetails(propertyType, req.body);
    if (propertyType === 'pg')    { propertyData.pgDetails        = details; }
    if (propertyType === 'guest') { propertyData.guestRoomDetails = details; }
    if (propertyType === 'plot')  { propertyData.plotDetails      = details; }

    const property = await Property.create(propertyData);

    await Notification.create({
      owner:   req.owner._id,
      title:   'Property Submitted!',
      message: `"${propertyName}" submitted and is under review.`,
      type:    'listing',
    });

    res.status(201).json({ success: true, message: 'Property created successfully', property });
  } catch (err) { next(err); }
};

// ── GET /api/properties/dashboard ────────────────────────────
exports.getDashboardStats = async (req, res, next) => {
  try {
    const id = req.owner._id;
    const [total, active, underReview, inactive, pg, guest, plot] = await Promise.all([
      Property.countDocuments({ owner: id }),
      Property.countDocuments({ owner: id, status: 'active' }),
      Property.countDocuments({ owner: id, status: 'under_review' }),
      Property.countDocuments({ owner: id, status: 'inactive' }),
      Property.countDocuments({ owner: id, propertyType: 'pg' }),
      Property.countDocuments({ owner: id, propertyType: 'guest' }),
      Property.countDocuments({ owner: id, propertyType: 'plot' }),
    ]);
    res.status(200).json({
      success: true,
      stats: { total, active, underReview, inactive, byType: { pg, guest, plot } },
    });
  } catch (err) { next(err); }
};

// ── GET /api/properties ───────────────────────────────────────
exports.getMyProperties = async (req, res, next) => {
  try {
    const filter = { owner: req.owner._id };
    if (req.query.status) { filter.status       = req.query.status; }
    if (req.query.type)   { filter.propertyType = req.query.type;   }
    const properties = await Property.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: properties.length, properties });
  } catch (err) { next(err); }
};

// ── GET /api/properties/:id ───────────────────────────────────
exports.getProperty = async (req, res, next) => {
  try {
    const property = await Property.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }
    res.status(200).json({ success: true, property });
  } catch (err) { next(err); }
};

// ── PUT /api/properties/:id ───────────────────────────────────
exports.updateProperty = async (req, res, next) => {
  try {
    const property = await Property.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }

    if (req.body.propertyName)  { property.propertyName  = req.body.propertyName.trim(); }
    if (req.body.location)      { property.location      = req.body.location.trim(); }
    if (req.body.localLandmark !== undefined) { property.localLandmark = req.body.localLandmark.trim(); }

    const details = buildTypeDetails(property.propertyType, req.body);
    if (property.propertyType === 'pg')    { property.pgDetails        = details; }
    if (property.propertyType === 'guest') { property.guestRoomDetails = details; }
    if (property.propertyType === 'plot')  { property.plotDetails      = details; }

    await property.save();
    res.status(200).json({ success: true, message: 'Property updated', property });
  } catch (err) { next(err); }
};

// ── PATCH /api/properties/:id/status ─────────────────────────
exports.updatePropertyStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'inactive', 'under_review'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const property = await Property.findOneAndUpdate(
      { _id: req.params.id, owner: req.owner._id },
      { status },
      { new: true }
    );
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }
    res.status(200).json({ success: true, message: `Status updated to ${status}`, property });
  } catch (err) { next(err); }
};

// ── DELETE /api/properties/:id ────────────────────────────────
exports.deleteProperty = async (req, res, next) => {
  try {
    const property = await Property.findOneAndDelete({ _id: req.params.id, owner: req.owner._id });
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }
    res.status(200).json({ success: true, message: 'Property deleted' });
  } catch (err) { next(err); }
};

// ── POST /api/properties/:id/photos ──────────────────────────
exports.uploadPropertyPhotos = async (req, res, next) => {
  try {
    const property = await Property.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No photos uploaded' });
    }

    const wasSuspendedOrRejected = ['suspended', 'rejected'].includes(property.status);

    const newPhotos = req.files.map(fileUrl);
    // For suspended/rejected — replace all photos so owner can fix them
    property.photos = wasSuspendedOrRejected
      ? newPhotos
      : [...(property.photos || []), ...newPhotos];

    if (wasSuspendedOrRejected) {
      property.pendingAdminReview = true;
      property.lastOwnerUpdateAt  = new Date();
    }

    await property.save();

    // ✅ Notify admin when a suspended/rejected owner uploads new photos
    if (wasSuspendedOrRejected) {
      await Notification.create({
        owner:   req.owner._id,   // we store against owner so admin query can find it
        title:   '🔔 Admin Re-review Needed',
        message: `Owner of "${property.propertyName}" has uploaded new photos after ${property.status === 'suspended' ? 'suspension' : 'rejection'}. Please review and take action.`,
        type:    'admin_review',
        forAdmin: true,
      });
      console.log(`🔔 Admin notified: owner re-uploaded photos for property ${property._id}`);
    }

    console.log(`📸 ${req.files.length} photo(s) saved for property ${property._id}`);
    res.status(200).json({
      success: true,
      message: `${req.files.length} photo(s) uploaded successfully`,
      photos:  property.photos,
      count:   property.photos.length,
    });
  } catch (err) { next(err); }
};

// ── POST /api/properties/:id/documents ───────────────────────
exports.uploadDocuments = async (req, res, next) => {
  try {
    const property = await Property.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!property) { return res.status(404).json({ success: false, message: 'Property not found' }); }

    const wasSuspendedOrRejected = ['suspended', 'rejected'].includes(property.status);

    if (req.files?.registry) { property.registryDocument = fileUrl(req.files.registry[0]); }
    if (req.files?.noc)      { property.nocDocument      = fileUrl(req.files.noc[0]); }

    if (!req.files?.registry && !req.files?.noc) {
      return res.status(400).json({ success: false, message: 'No documents uploaded' });
    }

    if (wasSuspendedOrRejected) {
      property.pendingAdminReview = true;
      property.lastOwnerUpdateAt  = new Date();
    }

    await property.save();

    // ✅ Notify admin when a suspended/rejected owner uploads new documents
    if (wasSuspendedOrRejected) {
      const uploadedDocs = [
        req.files?.registry ? 'Registry Document' : null,
        req.files?.noc      ? 'NOC Document'      : null,
      ].filter(Boolean).join(' & ');

      await Notification.create({
        owner:   req.owner._id,
        title:   '🔔 Admin Re-review Needed',
        message: `Owner of "${property.propertyName}" has uploaded new ${uploadedDocs} after ${property.status === 'suspended' ? 'suspension' : 'rejection'}. Please review and take action.`,
        type:    'admin_review',
        forAdmin: true,
      });
      console.log(`🔔 Admin notified: owner re-uploaded documents for property ${property._id}`);
    }

    console.log(`📄 Documents saved for property ${property._id}`);
    res.status(200).json({ success: true, message: 'Documents uploaded', property });
  } catch (err) { next(err); }
};
