const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Report title is required'],
    trim: true
  },
  description: String,
  type: {
    type: String,
    default: 'custom'
  },
  format: {
    type: String,
    default: 'pdf'
  },
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  options: {
    includeCharts: Boolean,
    sections: [String]
  },
  metadata: {
    generated: Date,
    dateRange: String,
    period: String,
    extra: mongoose.Schema.Types.Mixed
  },
  summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  breakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  downloads: {
    type: Number,
    default: 0
  },
  lastDownloaded: Date,
  generatedAt: Date,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

ReportSchema.virtual('id').get(function() {
  return this._id.toString();
});

module.exports = mongoose.model('Report', ReportSchema);
