const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'accountant', 'staff', 'client', 'sales', 'viewer'],
    default: 'staff'
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  phone: {
    type: String,
    trim: true
  },
  profileImage: {
    type: String,
    default: 'uploads/profile/default-avatar.png'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  emailVerificationOtp: {
    type: String,
    select: false
  },
  emailVerificationOtpExpire: {
    type: Date,
    select: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  invitationToken: String,
  invitationExpire: Date,
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  invitationAccepted: {
    type: Boolean,
    default: false
  },
  permissions: {
    invoices: {
      create: { type: Boolean, default: true },
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: false }
    },
    customers: {
      create: { type: Boolean, default: true },
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: false }
    },
    products: {
      create: { type: Boolean, default: true },
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: false }
    },
    reports: {
      view: { type: Boolean, default: false },
      export: { type: Boolean, default: false }
    },
    settings: {
      view: { type: Boolean, default: false },
      update: { type: Boolean, default: false }
    }
  },
  plan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    default: 'starter'
  },
  subscriptionStatus: {
    type: String,
    enum: ['trial', 'active', 'expired'],
    default: 'active'
  },
  trialEndsAt: Date,
  subscriptionEndsAt: Date,
  paystackCustomerCode: String,
  paystackSubscriptionCode: String,
  invoiceCountThisMonth: {
    type: Number,
    default: 0
  },
  invoiceLimit: {
    type: Number,
    default: 100
  },
  invoiceCountResetAt: Date,
  purchasedTemplates: {
    type: [String],
    default: []
  },
  hasLifetimeTemplates: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role, business: this.business },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
UserSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Generate invitation token
UserSchema.methods.getInvitationToken = function() {
  const inviteToken = crypto.randomBytes(20).toString('hex');

  this.invitationToken = crypto
    .createHash('sha256')
    .update(inviteToken)
    .digest('hex');

  this.invitationExpire = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  return inviteToken;
};

UserSchema.methods.generateEmailVerificationOtp = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  this.emailVerificationOtp = crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');

  this.emailVerificationOtpExpire = Date.now() + 10 * 60 * 1000;

  return otp;
};

module.exports = mongoose.model('User', UserSchema);
