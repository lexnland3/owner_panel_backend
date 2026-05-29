const mongoose = require('mongoose');

const FavouriteSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
}, { timestamps: true });

FavouriteSchema.index({ customer: 1, property: 1 }, { unique: true });
module.exports = mongoose.model('Favourite', FavouriteSchema);
