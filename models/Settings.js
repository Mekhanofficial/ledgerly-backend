const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    unique: true
  },
  invoice: {
    defaultTerms: String,
    defaultNotes: String,
    footer: String,
    watermark: String,
    showTaxId: {
      type: Boolean,
      default: true
    },
    showPaymentInstructions: {
      type: Boolean,
      default: true
    }
  },
  receipt: {
    header: String,
    footer: String,
    showChange: {
      type: Boolean,
      default: true
    },
    showThankYou: {
      type: Boolean,
      default: true
    }
  },
  notifications: {
    lowStock: {
      enabled: {
        type: Boolean,
        default: true
      },
      threshold: {
        type: Number,
        default: 10
      }
    },
    invoiceOverdue: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: {
        type: Number,
        default: 7
      }
    },
    dailySummary: {
      enabled: {
        type: Boolean,
        default: false
      },
      time: {
        type: String,
        default: '18:00'
      },
      recipients: [String]
    }
  },
  integrations: {
    stripe: {
      enabled: {
        type: Boolean,
        default: false
      },
      publicKey: String,
      secretKey: String,
      webhookSecret: String
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      provider: String,
      host: String,
      port: Number,
      secure: Boolean,
      username: String,
      password: String
    }
  },
  backup: {
    autoBackup: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    },
    lastBackup: Date,
    backupLocation: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', SettingsSchema);