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
  preferences: {
    language: {
      type: String,
      default: 'en-US'
    },
    fontSize: {
      type: Number,
      default: 16
    },
    fontScaleFactor: {
      type: Number,
      default: 1,
      min: 0.5,
      max: 2
    },
    currencyDecimalPlaces: {
      type: Number,
      default: 2,
      min: 0,
      max: 4
    },
    numberFormat: {
      type: String,
      enum: ['standard', 'compact', 'european'],
      default: 'standard'
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
  rolePermissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  integrations: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      stripe: { enabled: false, publicKey: '', secretKey: '', webhookSecret: '' },
      paypal: { enabled: false, clientId: '', secret: '', mode: 'sandbox' },
      paystack: { enabled: false, publicKey: '', secretKey: '' },
      email: { enabled: false, provider: 'smtp', host: '', port: 587, secure: false, username: '', password: '' },
      quickbooks: { enabled: false, clientId: '', clientSecret: '' },
      xero: { enabled: false, clientId: '', clientSecret: '' },
      wave: { enabled: false, apiKey: '' },
      zapier: { enabled: false, webhookUrl: '' },
      whatsapp: { enabled: false, apiKey: '', senderId: '' },
      sms: { enabled: false, provider: '', apiKey: '', senderId: '' },
      restApi: { enabled: true, keyRotationDays: 90, webhookBaseUrl: '' }
    })
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
