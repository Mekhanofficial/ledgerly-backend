const User = require('../models/User');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const crypto = require('crypto');
const path = require('path');
const { OTP_EXPIRY_MINUTES, sendVerificationOtpEmail } = require('../emailmicroservice');
const { getDefaultPermissions } = require('../utils/rolePermissions');
const {
  startTrialForUser,
  resolveBillingOwner,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser
} = require('../utils/subscriptionService');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const hashOtp = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || '').trim())
    .digest('hex');

const issueAndSendEmailVerificationOtp = async (user) => {
  const otp = user.generateEmailVerificationOtp();
  await user.save({ validateBeforeSave: false });
  await sendVerificationOtpEmail({
    to: user.email,
    name: user.name,
    otp
  });
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, businessName, currency, currencyCode } = req.body;
  const normalizedEmail = normalizeEmail(email);

  // Check if user exists
  const userExists = await User.findOne({ email: normalizedEmail });
  if (userExists) {
    if (userExists.emailVerified) {
      return next(new ErrorResponse('User already exists', 400));
    }

    let otpSent = true;
    let otpErrorMessage = '';
    try {
      await issueAndSendEmailVerificationOtp(userExists);
    } catch (otpError) {
      otpSent = false;
      otpErrorMessage = otpError?.message || 'Unable to send verification code';
      console.error('Failed to resend registration OTP for existing unverified user:', otpErrorMessage);
    }

    return res.status(200).json({
      success: true,
      message: otpSent
        ? 'Account already exists but is not verified. A new verification code has been sent to your email.'
        : 'Account already exists but is not verified. We could not send verification code right now. Please try resend OTP.',
      data: {
        email: userExists.email,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        otpSent,
        otpError: otpSent ? undefined : otpErrorMessage
      }
    });
  }

  // Create business
  const resolvedCurrency = (currencyCode || currency || 'USD').toString().trim().toUpperCase();

  const business = await Business.create({
    name: businessName,
    email: normalizedEmail,
    phone,
    currency: resolvedCurrency,
    owner: null // Will be updated after user creation
  });

  // Create user
  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    phone,
    business: business._id,
    role: 'admin',
    permissions: getDefaultPermissions('admin')
  });

  // Update business owner
  business.owner = user._id;
  await business.save();

  // Start free trial for new accounts
  await startTrialForUser({ user, business });

  let otpSent = true;
  let otpErrorMessage = '';

  try {
    await issueAndSendEmailVerificationOtp(user);
  } catch (otpError) {
    otpSent = false;
    otpErrorMessage = otpError?.message || 'Unable to send verification code';
    console.error('Failed to send registration OTP:', otpErrorMessage);
  }

  res.status(201).json({
    success: true,
    message: otpSent
      ? 'Account created. A verification code has been sent to your email.'
      : 'Account created, but we could not send verification code right now. Please use resend OTP.',
    data: {
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      otpSent,
      otpError: otpSent ? undefined : otpErrorMessage
    }
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  // Validate email & password
  if (!normalizedEmail || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  // Check for user
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  
  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new ErrorResponse('Account is deactivated', 401));
  }

  if (!user.emailVerified) {
    return next(new ErrorResponse('Please verify your email with the OTP sent to your inbox', 403));
  }

  // Check password
  const isMatch = await user.matchPassword(password);
  
  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Update last login
  user.lastLogin = Date.now();
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Verify email OTP
// @route   POST /api/v1/auth/verify-email-otp
// @access  Public
exports.verifyEmailOtp = asyncHandler(async (req, res, next) => {
  const normalizedEmail = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || '').trim();

  if (!normalizedEmail || !otp) {
    return next(new ErrorResponse('Email and OTP are required', 400));
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+emailVerificationOtp +emailVerificationOtpExpire'
  );

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  if (user.emailVerified) {
    return res.status(200).json({
      success: true,
      message: 'Email is already verified. You can log in.'
    });
  }

  if (!user.emailVerificationOtp || !user.emailVerificationOtpExpire) {
    return next(new ErrorResponse('No verification code found. Please request a new OTP.', 400));
  }

  if (new Date(user.emailVerificationOtpExpire).getTime() < Date.now()) {
    user.emailVerificationOtp = undefined;
    user.emailVerificationOtpExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ErrorResponse('Verification code expired. Please request a new OTP.', 400));
  }

  if (hashOtp(otp) !== user.emailVerificationOtp) {
    return next(new ErrorResponse('Invalid verification code', 400));
  }

  user.emailVerified = true;
  user.verificationToken = undefined;
  user.emailVerificationOtp = undefined;
  user.emailVerificationOtpExpire = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully. You can now log in.'
  });
});

// @desc    Resend email OTP
// @route   POST /api/v1/auth/resend-email-otp
// @access  Public
exports.resendEmailOtp = asyncHandler(async (req, res, next) => {
  const normalizedEmail = normalizeEmail(req.body.email);

  if (!normalizedEmail) {
    return next(new ErrorResponse('Email is required', 400));
  }

  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  if (user.emailVerified) {
    return res.status(200).json({
      success: true,
      message: 'Email is already verified.'
    });
  }

  await issueAndSendEmailVerificationOtp(user);

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email.',
    data: {
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES
    }
  });
});

// @desc    Logout user
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const billingOwner = await resolveBillingOwner(req.user);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const user = await User.findById(req.user.id)
    .populate('business', 'name logo email phone address subscription currency');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const updates = {};
  ['name', 'email', 'phone'].forEach((field) => {
    if (req.body[field] !== undefined && req.body[field] !== '') {
      updates[field] = req.body[field];
    }
  });

  if (req.file) {
    updates.profileImage = req.file.path.split(path.sep).join('/');
  }

  if (Object.keys(updates).length === 0) {
    return next(new ErrorResponse('No updates provided', 400));
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  if (!(await user.matchPassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Password is incorrect', 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: normalizeEmail(req.body.email) });

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // Create reset url (frontend)
  const baseUrl = process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset-password/${resetToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `You are receiving this email because you (or someone else) has requested a password reset. Please make a PUT request to: \n\n ${resetUrl}`
    });

    res.status(200).json({
      success: true,
      data: 'Email sent'
    });
  } catch (err) {
    console.error(err);
    
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid token', 400));
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Confirm email
// @route   GET /api/v1/auth/confirmemail/:token
// @access  Public
exports.confirmEmail = asyncHandler(async (req, res, next) => {
  const verificationToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({ verificationToken });

  if (!user) {
    return next(new ErrorResponse('Invalid verification token', 400));
  }

  user.emailVerified = true;
  user.verificationToken = undefined;
  user.emailVerificationOtp = undefined;
  user.emailVerificationOtpExpire = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully'
  });
});

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      phone: user.phone,
      role: user.role,
      business: user.business,
      profileImage: user.profileImage,
      permissions: user.permissions
    }
    });
};
