const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String,
      required: [true, 'Please add a document name'],
      trim: true
    },
    originalName: String,
    fileName: String,
    filePath: String,
    filePublicId: String,
    fileResourceType: String,
    mimeType: String,
    size: Number,
    folder: {
      type: String,
      default: ''
    },
    tags: {
      type: [String],
      default: []
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['document', 'scan'],
      default: 'document'
    }
  },
  { timestamps: true }
);

DocumentSchema.index({ business: 1, createdAt: -1 });
DocumentSchema.index({ business: 1, name: 1 });
DocumentSchema.index({ business: 1, folder: 1 });
DocumentSchema.index({ business: 1, tags: 1 });
DocumentSchema.index({ business: 1, isArchived: 1 });

module.exports = mongoose.model('Document', DocumentSchema);
