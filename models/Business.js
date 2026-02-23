const mongoose = require('mongoose');
const { encryptString, decryptString, maskSecret } = require('../utils/fieldEncryption');

const BusinessSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a business name'],
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  email: {
    type: String,
    required: [true, 'Please add a business email'],
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Please add a phone number']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  logo: {
    type: String,
    default: 'default-logo.png'
  },
  website: String,
  taxId: String,
  registrationNumber: String,
  industry: String,
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  fiscalYearStart: {
    type: Date,
    default: new Date(new Date().getFullYear(), 0, 1) // Jan 1 of current year
  },
  invoiceSettings: {
    prefix: {
      type: String,
      default: 'INV'
    },
    nextNumber: {
      type: Number,
      default: 1
    },
    terms: {
      type: String,
      default: 'Payment due within 30 days'
    },
    notes: String,
    dueDays: {
      type: Number,
      default: 30
    },
    lateFeePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lateFeeFixed: {
      type: Number,
      default: 0
    }
  },
  receiptSettings: {
    prefix: {
      type: String,
      default: 'RCP'
    },
    nextNumber: {
      type: Number,
      default: 1
    },
    footerMessage: String
  },
  taxSettings: {
    enabled: {
      type: Boolean,
      default: false
    },
    defaultRate: {
      type: Number,
      default: 0
    },
    rates: [{
      name: String,
      rate: Number,
      description: String,
      isDefault: {
        type: Boolean,
        default: false
      }
    }]
  },
  paymentMethods: [{
    name: String,
    isActive: {
      type: Boolean,
      default: true
    },
    accountDetails: String
  }],
  paystack: {
    enabled: {
      type: Boolean,
      default: false
    },
    publicKey: {
      type: String,
      trim: true
    },
    secretKeyEncrypted: {
      type: String,
      select: false
    },
    secretKeyLast4: {
      type: String,
      default: ''
    },
    webhookEnabled: {
      type: Boolean,
      default: true
    },
    connectedAt: Date,
    updatedAt: Date
  },
  emailSettings: {
    host: String,
    port: Number,
    secure: Boolean,
    auth: {
      user: String,
      pass: String
    },
    fromName: String,
    fromEmail: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'expired', 'past_due', 'canceled', 'incomplete'],
      default: 'active'
    },
    currentPeriodEnd: Date,
    trialEndsAt: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String
  },
  settings: {
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    autoBackup: {
      type: Boolean,
      default: false
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    }
  }
}, {
  timestamps: true
});

// Update invoice number
BusinessSchema.methods.getNextInvoiceNumber = async function() {
  const nextNumber = this.invoiceSettings.nextNumber;
  this.invoiceSettings.nextNumber += 1;
  await this.save();
  return `${this.invoiceSettings.prefix}-${String(nextNumber).padStart(5, '0')}`;
};

// Update receipt number
BusinessSchema.methods.getNextReceiptNumber = async function() {
  const nextNumber = this.receiptSettings.nextNumber;
  this.receiptSettings.nextNumber += 1;
  await this.save();
  return `${this.receiptSettings.prefix}-${String(nextNumber).padStart(5, '0')}`;
};

BusinessSchema.methods.setPaystackSecretKey = function(secretKey) {
  const trimmed = String(secretKey || '').trim();

  if (!trimmed) {
    this.paystack = {
      ...(this.paystack || {}),
      secretKeyEncrypted: '',
      secretKeyLast4: ''
    };
    return;
  }

  this.paystack = {
    ...(this.paystack || {}),
    secretKeyEncrypted: encryptString(trimmed),
    secretKeyLast4: trimmed.slice(-4)
  };
};

BusinessSchema.methods.getPaystackSecretKey = function() {
  const encrypted = this.paystack?.secretKeyEncrypted;
  if (!encrypted) return '';
  return decryptString(encrypted);
};

BusinessSchema.methods.getPaystackSummary = function() {
  const publicKey = String(this.paystack?.publicKey || '').trim();
  const hasSecretKey = Boolean(this.paystack?.secretKeyEncrypted);
  const publicKeyMasked = publicKey ? maskSecret(publicKey, 6) : '';
  const secretKeyMasked = this.paystack?.secretKeyLast4
    ? `${'*'.repeat(8)}${this.paystack.secretKeyLast4}`
    : '';

  return {
    enabled: Boolean(this.paystack?.enabled),
    webhookEnabled: this.paystack?.webhookEnabled !== false,
    connectedAt: this.paystack?.connectedAt || null,
    updatedAt: this.paystack?.updatedAt || null,
    publicKey,
    publicKeyMasked,
    hasSecretKey,
    secretKeyMasked
  };
};

module.exports = mongoose.model('Business', BusinessSchema);
