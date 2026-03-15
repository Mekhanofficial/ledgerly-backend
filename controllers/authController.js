const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const crypto = require('crypto');
const { OTP_EXPIRY_MINUTES, sendVerificationOtpEmail } = require('../emailmicroservice');
const { getDefaultPermissions } = require('../utils/rolePermissions');
const { verifyTransaction } = require('../utils/paystack');
const { normalizePlanId } = require('../utils/planConfig');
const {
  DEFAULT_PROFILE_IMAGE,
  buildAssetUrl,
  normalizeStoredAsset,
  removeStoredAsset,
  uploadCloudinaryImage
} = require('../utils/assetStorage');
const {
  startTrialForUser,
  updateSubscriptionFromPayment,
  resolveBillingOwner,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser
} = require('../utils/subscriptionService');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const OTP_SEND_TIMEOUT_MS = parsePositiveInt(process.env.OTP_SEND_TIMEOUT_MS, 20000);
const OTP_SAVE_TIMEOUT_MS = parsePositiveInt(process.env.OTP_SAVE_TIMEOUT_MS, 15000);
const TRIAL_SETUP_TIMEOUT_MS = parsePositiveInt(process.env.TRIAL_SETUP_TIMEOUT_MS, 15000);
const PAYMENT_VERIFY_TIMEOUT_MS = parsePositiveInt(process.env.PAYMENT_VERIFY_TIMEOUT_MS, 20000);

const runWithTimeout = async (task, timeoutMs, timeoutMessage) => {
  const promise = Promise.resolve(task);
  // Prevent unhandled rejection if timeout wins the race.
  promise.catch(() => {});
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const toClientUser = (userDoc, req) => {
  const user = userDoc?.toObject ? userDoc.toObject() : { ...(userDoc || {}) };
  user.avatarUrl = buildAssetUrl(req, user.profileImage);
  return user;
};

const hashOtp = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || '').trim())
    .digest('hex');

const persistEmailVerificationOtp = async (user) => {
  const otp = user.generateEmailVerificationOtp();
  await runWithTimeout(
    user.save({ validateBeforeSave: false }),
    OTP_SAVE_TIMEOUT_MS,
    `OTP persistence timed out after ${OTP_SAVE_TIMEOUT_MS}ms`
  );
  return otp;
};

const sendEmailVerificationOtp = async ({ user, otp }) => {
  const sendTask = sendVerificationOtpEmail({
    to: user.email,
    name: user.name,
    otp
  });
  await runWithTimeout(
    sendTask,
    OTP_SEND_TIMEOUT_MS,
    `OTP email send timed out after ${OTP_SEND_TIMEOUT_MS}ms`
  );
};

const issueAndSendEmailVerificationOtp = async (user) => {
  const otp = await persistEmailVerificationOtp(user);
  await sendEmailVerificationOtp({ user, otp });
};

const queueEmailVerificationOtp = async (user, contextLabel = 'verification') => {
  const otp = await persistEmailVerificationOtp(user);
  setImmediate(async () => {
    try {
      await sendEmailVerificationOtp({ user, otp });
    } catch (otpError) {
      console.error(
        `Failed to deliver ${contextLabel} OTP email:`,
        otpError?.message || otpError
      );
    }
  });
};

const resolveLandingSubscriptionFromPayment = async ({ reference, expectedEmail }) => {
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) return null;

  const existingClaim = await Subscription.findOne({
    paystackTransactionReference: normalizedReference
  })
    .select('user')
    .lean();

  if (existingClaim) {
    throw new ErrorResponse('This payment reference has already been used', 409);
  }

  const verification = await runWithTimeout(
    verifyTransaction(normalizedReference),
    PAYMENT_VERIFY_TIMEOUT_MS,
    `Payment verification timed out after ${PAYMENT_VERIFY_TIMEOUT_MS}ms`
  );
  const paymentData = verification?.data || {};
  const status = String(paymentData?.status || '').trim().toLowerCase();

  if (status !== 'success') {
    throw new ErrorResponse('Payment is not successful or could not be verified', 400);
  }

  const metadata = paymentData?.metadata || {};
  const paymentType = String(metadata?.type || '').trim().toLowerCase();
  if (paymentType !== 'landing_subscription') {
    throw new ErrorResponse('Payment reference is not valid for plan signup', 400);
  }

  const paidEmail = normalizeEmail(metadata?.email || paymentData?.customer?.email || '');
  const normalizedExpectedEmail = normalizeEmail(expectedEmail);
  if (paidEmail && normalizedExpectedEmail && paidEmail !== normalizedExpectedEmail) {
    throw new ErrorResponse('Payment email does not match the signup email', 400);
  }

  return {
    reference: normalizedReference,
    plan: normalizePlanId(metadata?.plan || metadata?.planId),
    billingCycle: metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    paystackCustomerCode: paymentData?.customer?.customer_code || paymentData?.customer?.id || undefined,
    paystackPlanCode: paymentData?.plan?.plan_code || undefined
  };
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    password,
    phone,
    businessName,
    currency,
    currencyCode,
    country,
    paymentReference
  } = req.body;
  const normalizedEmail = normalizeEmail(email);

  // Check if user exists
  const userExists = await User.findOne({ email: normalizedEmail });
  if (userExists) {
    let upgradedPlanContext = null;
    if (paymentReference) {
      const normalizedReference = String(paymentReference).trim();
      const existingClaim = await Subscription.findOne({
        paystackTransactionReference: normalizedReference
      })
        .select('user plan billingCycle')
        .lean();

      if (existingClaim && String(existingClaim.user) === String(userExists._id)) {
        upgradedPlanContext = {
          reference: normalizedReference,
          plan: normalizePlanId(existingClaim.plan),
          billingCycle: existingClaim.billingCycle === 'yearly' ? 'yearly' : 'monthly'
        };
        const existingBusiness = await Business.findById(userExists.business);
        if (!existingBusiness) {
          return next(new ErrorResponse('Business record not found for this account', 404));
        }
        await updateSubscriptionFromPayment({
          user: userExists,
          business: existingBusiness,
          plan: upgradedPlanContext.plan,
          billingCycle: upgradedPlanContext.billingCycle,
          paystackTransactionReference: upgradedPlanContext.reference
        });
        await syncBusinessFromUser(userExists);
      } else {
        upgradedPlanContext = await resolveLandingSubscriptionFromPayment({
          reference: normalizedReference,
          expectedEmail: normalizedEmail
        });
        const existingBusiness = await Business.findById(userExists.business);
        if (!existingBusiness) {
          return next(new ErrorResponse('Business record not found for this account', 404));
        }
        await updateSubscriptionFromPayment({
          user: userExists,
          business: existingBusiness,
          plan: upgradedPlanContext.plan,
          billingCycle: upgradedPlanContext.billingCycle,
          paystackCustomerCode: upgradedPlanContext.paystackCustomerCode,
          paystackPlanCode: upgradedPlanContext.paystackPlanCode,
          paystackTransactionReference: upgradedPlanContext.reference
        });
        await syncBusinessFromUser(userExists);
      }
    }

    if (userExists.emailVerified) {
      if (upgradedPlanContext) {
        return next(
          new ErrorResponse(
            `Account already exists. ${upgradedPlanContext.plan} plan has been activated. Please sign in.`,
            409
          )
        );
      }
      return next(new ErrorResponse('User already exists', 400));
    }

    let otpSent = true;
    let otpErrorMessage = '';
    try {
      await queueEmailVerificationOtp(userExists, 'registration');
    } catch (otpError) {
      otpSent = false;
      otpErrorMessage = otpError?.message || 'Unable to queue verification code';
      console.error('Failed to queue registration OTP for existing unverified user:', otpErrorMessage);
    }

    return res.status(200).json({
      success: true,
      message: otpSent
        ? 'Account already exists but is not verified. A new verification code is being sent to your email. Use resend OTP if it does not arrive shortly.'
        : 'Account already exists but is not verified. We could not send verification code right now. Please try resend OTP.',
      data: {
        email: userExists.email,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        otpSent,
        otpError: otpSent ? undefined : otpErrorMessage,
        subscription: upgradedPlanContext
          ? {
            plan: upgradedPlanContext.plan,
            billingCycle: upgradedPlanContext.billingCycle,
            reference: upgradedPlanContext.reference
          }
          : undefined
      }
    });
  }

  const paidSubscriptionContext = await resolveLandingSubscriptionFromPayment({
    reference: paymentReference,
    expectedEmail: normalizedEmail
  });

  // Create business
  const resolvedCurrency = (currencyCode || currency || 'USD').toString().trim().toUpperCase();
  const resolvedCountry = String(country || '').trim();
  const businessPayload = {
    name: businessName,
    email: normalizedEmail,
    phone,
    currency: resolvedCurrency,
    owner: null // Will be updated after user creation
  };

  if (resolvedCountry) {
    businessPayload.address = {
      country: resolvedCountry
    };
  }

  const business = await Business.create(businessPayload);

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

  if (paidSubscriptionContext) {
    try {
      await runWithTimeout(
        updateSubscriptionFromPayment({
          user,
          business,
          plan: paidSubscriptionContext.plan,
          billingCycle: paidSubscriptionContext.billingCycle,
          paystackCustomerCode: paidSubscriptionContext.paystackCustomerCode,
          paystackPlanCode: paidSubscriptionContext.paystackPlanCode,
          paystackTransactionReference: paidSubscriptionContext.reference
        }),
        TRIAL_SETUP_TIMEOUT_MS,
        `Paid subscription setup timed out after ${TRIAL_SETUP_TIMEOUT_MS}ms`
      );
    } catch (subscriptionError) {
      console.error('Paid subscription setup failed during registration:', subscriptionError?.message || subscriptionError);
      return next(new ErrorResponse('Unable to apply paid plan during signup. Please contact support.', 500));
    }
  } else {
    // Start free trial for new accounts without blocking registration indefinitely.
    try {
      await runWithTimeout(
        startTrialForUser({ user, business }),
        TRIAL_SETUP_TIMEOUT_MS,
        `Trial setup timed out after ${TRIAL_SETUP_TIMEOUT_MS}ms`
      );
    } catch (trialError) {
      console.error('Trial setup failed during registration:', trialError?.message || trialError);
    }
  }

  await syncBusinessFromUser(user);

  let otpSent = true;
  let otpErrorMessage = '';

  try {
    await queueEmailVerificationOtp(user, 'registration');
  } catch (otpError) {
    otpSent = false;
    otpErrorMessage = otpError?.message || 'Unable to queue verification code';
    console.error('Failed to queue registration OTP:', otpErrorMessage);
  }

  const accountCreatedMessage = paidSubscriptionContext
    ? `Account created. ${paidSubscriptionContext.plan} plan has been activated.`
    : 'Account created.';

  res.status(201).json({
    success: true,
    message: otpSent
      ? `${accountCreatedMessage} A verification code is being sent to your email. Use resend OTP if it does not arrive shortly.`
      : `${accountCreatedMessage} We could not send verification code right now. Please use resend OTP.`,
    data: {
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      otpSent,
      otpError: otpSent ? undefined : otpErrorMessage,
      subscription: paidSubscriptionContext
        ? {
          plan: paidSubscriptionContext.plan,
          billingCycle: paidSubscriptionContext.billingCycle,
          reference: paidSubscriptionContext.reference
        }
        : undefined
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

  // Persist last login asynchronously so authentication response is not blocked.
  User.findByIdAndUpdate(user._id, { $set: { lastLogin: new Date() } }).catch((error) => {
    console.warn('Unable to persist lastLogin timestamp:', error?.message || error);
  });

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

  let otpSent = true;
  let otpErrorMessage = '';
  try {
    await issueAndSendEmailVerificationOtp(user);
  } catch (otpError) {
    otpSent = false;
    otpErrorMessage = otpError?.message || 'Unable to send verification code';
    console.error('Failed to resend verification OTP:', otpErrorMessage);
  }

  res.status(200).json({
    success: true,
    message: otpSent
      ? 'A new verification code has been sent to your email.'
      : 'We could not send verification code right now. Please try again shortly.',
    data: {
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      otpSent,
      otpError: otpSent ? undefined : otpErrorMessage
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
    data: toClientUser(user, req)
  });
});

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const removeProfileImageRequested = (() => {
    if (typeof req.body.removeProfileImage === 'boolean') {
      return req.body.removeProfileImage;
    }
    const normalized = String(req.body.removeProfileImage || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  })();

  const updatedFields = new Set();

  if (req.body.name !== undefined && req.body.name !== '') {
    user.name = req.body.name;
    updatedFields.add('name');
  }
  if (req.body.email !== undefined && req.body.email !== '') {
    user.email = normalizeEmail(req.body.email);
    updatedFields.add('email');
  }
  if (req.body.phone !== undefined && req.body.phone !== '') {
    user.phone = req.body.phone;
    updatedFields.add('phone');
  }

  let previousProfileImage = '';
  let previousProfileImagePublicId = '';
  let uploadedProfileImage = null;
  const shouldRemoveProfileImage = removeProfileImageRequested && !req.file?.buffer;

  if (shouldRemoveProfileImage) {
    previousProfileImage = user.profileImage || '';
    previousProfileImagePublicId = user.profileImagePublicId || '';
    user.profileImage = DEFAULT_PROFILE_IMAGE;
    user.profileImagePublicId = '';
    updatedFields.add('profileImage');
  }

  if (req.file?.buffer) {
    if (!previousProfileImage) {
      previousProfileImage = user.profileImage || '';
      previousProfileImagePublicId = user.profileImagePublicId || '';
    }
    uploadedProfileImage = await uploadCloudinaryImage(req.file, {
      assetType: 'profile',
      fileName: user.name || user.email || 'profile-image'
    });
    user.profileImage = normalizeStoredAsset(uploadedProfileImage?.url);
    user.profileImagePublicId = uploadedProfileImage?.publicId || '';
    updatedFields.add('profileImage');
  }

  if (updatedFields.size === 0) {
    return next(new ErrorResponse('No updates provided', 400));
  }

  try {
    await user.save();
  } catch (error) {
    if (uploadedProfileImage?.url) {
      await removeStoredAsset({
        url: uploadedProfileImage.url,
        publicId: uploadedProfileImage.publicId
      });
    }
    throw error;
  }

  if (previousProfileImage && previousProfileImage !== user.profileImage) {
    await removeStoredAsset({
      url: previousProfileImage,
      publicId: previousProfileImagePublicId,
      preserve: [DEFAULT_PROFILE_IMAGE]
    });
  }

  res.status(200).json({
    success: true,
    data: toClientUser(user, req)
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

  const profileImage = normalizeStoredAsset(user.profileImage) || DEFAULT_PROFILE_IMAGE;

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
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      subscriptionEndsAt: user.subscriptionEndsAt,
      business: user.business,
      profileImage,
      avatarUrl: buildAssetUrl(res.req, profileImage),
      permissions: user.permissions
    }
    });
};
