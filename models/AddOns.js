const mongoose = require('mongoose');

const AddOnsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  whiteLabelEnabled: {
    type: Boolean,
    default: false
  },
  extraSeats: {
    type: Number,
    default: 0,
    min: 0
  },
  analyticsEnabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

AddOnsSchema.index({ business: 1 }, { unique: true });

module.exports = mongoose.model('AddOns', AddOnsSchema);
