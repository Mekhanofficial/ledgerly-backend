const mongoose = require('mongoose');

const TemplateEmailSettingSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true
    },
    templateId: {
      type: String,
      required: true,
      trim: true
    },
    emailSubject: {
      type: String,
      trim: true,
      default: ''
    },
    emailMessage: {
      type: String,
      trim: true,
      default: ''
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

TemplateEmailSettingSchema.index({ business: 1, templateId: 1 }, { unique: true });

module.exports = mongoose.model('TemplateEmailSetting', TemplateEmailSettingSchema);
