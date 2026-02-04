const User = require('../models/User');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const crypto = require('crypto');
const path = require('path');

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, businessName } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new ErrorResponse('User already exists', 400));
  }

  // Create business
  const business = await Business.create({
    name: businessName,
    email,
    phone,
    owner: null // Will be updated after user creation
  });

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    business: business._id,
    role: 'admin'
  });

  // Update business owner
  business.owner = user._id;
  await business.save();

  // Generate verification token
  const verificationToken = crypto.randomBytes(20).toString('hex');
  user.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  await user.save();

  // Send verification email
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/confirmemail/${verificationToken}`;
  
  await sendEmail({
    to: user.email,
    subject: 'Email Verification - InvoiceFlow',
    template: 'verification',
    context: {
      name: user.name,
      verificationUrl
    }
  });

  sendTokenResponse(user, 201, res);
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  // Check for user
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new ErrorResponse('Account is deactivated', 401));
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
  const user = await User.findById(req.user.id)
    .populate('business', 'name logo email phone address subscription');

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
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // Create reset url
  const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/resetpassword/${resetToken}`;

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
      phone: user.phone,
      role: user.role,
      business: user.business,
      profileImage: user.profileImage,
      permissions: user.permissions
    }
    });
};
