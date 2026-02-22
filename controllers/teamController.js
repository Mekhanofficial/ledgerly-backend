const crypto = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const {
  normalizeRole,
  getDefaultPermissions,
  canManageRoles,
  isRoleSupported,
  isSuperAdmin,
  isAdmin
} = require('../utils/rolePermissions');

const getRequesterRole = (req) => req.user?.effectiveRole || normalizeRole(req.user?.role);
const ADMIN_ALLOWED_ROLES = ['admin', 'accountant', 'staff', 'client', 'viewer'];
const isProtectedAdminRole = (role) => isSuperAdmin(role) || isAdmin(role);

const logAuditEntry = async (req, action, resource, details = {}) => {
  await AuditLog.create({
    business: req.user ? req.user.business : details.business,
    user: req.user ? req.user.id : details.user,
    action,
    resource,
    details
  });
};

const sendInviteEmail = async (email, name, token, inviterName, baseUrl) => {
  const inviteUrl = `${baseUrl}/team/accept-invite/${token}`;
  const text = `${name || 'Team member'},\n\n${inviterName} has invited you to join Ledgerly.\n\nClick here to accept the invitation:\n${inviteUrl}\n\nThe link expires in 7 days.\n\nIf you did not request this, please ignore this message.`;

  await sendEmail({
    to: email,
    subject: 'You are invited to Ledgerly',
    text
  });

  return inviteUrl;
};

// @desc    Get all team members
// @route   GET /api/v1/team
// @access  Private (Admin)
exports.getTeamMembers = asyncHandler(async (req, res, next) => {
  const query = { business: req.user.business };

  if (req.query.includeInactive !== 'true') {
    query.isActive = true;
  }

  const users = await User.find(query)
    .select('-password -resetPasswordToken -invitationToken -invitationExpire')
    .sort({ role: 1, name: 1 });

  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Invite a team member
// @route   POST /api/v1/team/invite
// @access  Private (Admin)
exports.inviteTeamMember = asyncHandler(async (req, res, next) => {
  const { email, role, name, permissions, customerId } = req.body;
  const requesterRole = getRequesterRole(req);

  if (!email || !name) {
    return next(new ErrorResponse('Name and email are required', 400));
  }

  const normalizedRole = normalizeRole(role || 'staff');
  if (!isRoleSupported(normalizedRole)) {
    return next(new ErrorResponse('Invalid role provided', 400));
  }

  if (!isSuperAdmin(requesterRole)) {
    if (!isAdmin(requesterRole)) {
      return next(new ErrorResponse('Not authorized to invite team members', 403));
    }
    if (!ADMIN_ALLOWED_ROLES.includes(normalizedRole)) {
      return next(new ErrorResponse('Only super admins can assign that role', 403));
    }
  }

  if (normalizedRole === 'client' && !customerId) {
    return next(new ErrorResponse('customerId is required for client users', 400));
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return next(new ErrorResponse('A user with that email already exists', 400));
  }

  const tempPassword = crypto.randomBytes(8).toString('hex');

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    role: normalizedRole,
    business: req.user.business,
    password: tempPassword,
    invitedBy: req.user.id,
    invitationAccepted: false,
    customer: normalizedRole === 'client' ? customerId : undefined,
    permissions: isSuperAdmin(requesterRole) ? (permissions || getDefaultPermissions(normalizedRole)) : getDefaultPermissions(normalizedRole)
  });

  const token = user.getInvitationToken();
  await user.save();

  const baseUrl = process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`;
  const inviteUrl = await sendInviteEmail(user.email, user.name, token, req.user.name, baseUrl);
  const emailConfigured = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

  await logAuditEntry(req, 'invite-team-member', 'User', { userId: user._id, email: user.email });

  res.status(201).json({
    success: true,
    message: emailConfigured ? 'Invitation sent' : 'Invitation created',
    data: {
      userId: user._id,
      inviteUrl: emailConfigured ? undefined : inviteUrl
    }
  });
});

// @desc    Resend invitation
// @route   POST /api/v1/team/:id/resend-invite
// @access  Private (Admin)
exports.resendInvitation = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (user.invitationAccepted) {
    return next(new ErrorResponse('Invitation already accepted', 400));
  }

  const token = user.getInvitationToken();
  await user.save();

  const baseUrl = process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`;
  const inviteUrl = await sendInviteEmail(user.email, user.name, token, req.user.name, baseUrl);
  const emailConfigured = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

  await logAuditEntry(req, 'resend-invitation', 'User', { userId: user._id });

  res.status(200).json({
    success: true,
    message: emailConfigured ? 'Invitation resent' : 'Invitation link generated',
    data: {
      inviteUrl: emailConfigured ? undefined : inviteUrl
    }
  });
});

// @desc    Accept invitation
// @route   POST /api/v1/team/accept/:token
// @access  Public
exports.acceptTeamInvite = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password, name } = req.body;

  if (!password) {
    return next(new ErrorResponse('Password is required', 400));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    invitationToken: hashedToken,
    invitationExpire: { $gt: Date.now() }
  }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid or expired invitation token', 400));
  }

  user.password = password;
  user.invitationAccepted = true;
  user.invitationToken = undefined;
  user.invitationExpire = undefined;
  user.emailVerified = true;
  user.isActive = true;

  if (name) {
    user.name = name;
  }

  await user.save();

  await logAuditEntry({
    user: { id: user._id, business: user.business }
  }, 'accept-invitation', 'User', { userId: user._id });

  res.status(200).json({
    success: true,
    message: 'Invitation accepted. Please sign in.'
  });
});

// @desc    Update team member
// @route   PUT /api/v1/team/:id
// @access  Private (Admin)
exports.updateTeamMember = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const requesterRole = getRequesterRole(req);
  if (isAdmin(requesterRole) && isSuperAdmin(user.role)) {
    return next(new ErrorResponse('Cannot modify a super admin', 403));
  }

  if (req.body.isActive === false && isProtectedAdminRole(user.role)) {
    return next(new ErrorResponse('Admin accounts cannot be deactivated', 403));
  }

  if (req.body.role) {
    const normalizedRole = normalizeRole(req.body.role);
    if (!isRoleSupported(normalizedRole)) {
      return next(new ErrorResponse('Invalid role provided', 400));
    }
    if (!isSuperAdmin(requesterRole)) {
      if (!isAdmin(requesterRole)) {
        return next(new ErrorResponse('Not authorized to change roles', 403));
      }
      if (!ADMIN_ALLOWED_ROLES.includes(normalizedRole)) {
        return next(new ErrorResponse('Only super admins can assign that role', 403));
      }
    }
    if (normalizedRole === 'client' && !req.body.customerId && !user.customer) {
      return next(new ErrorResponse('customerId is required for client users', 400));
    }
    user.role = normalizedRole;
    if (!req.body.permissions) {
      user.permissions = getDefaultPermissions(normalizedRole);
    }
  }

  if (req.body.permissions) {
    if (!canManageRoles(req.user.role)) {
      return next(new ErrorResponse('Only super admins can update permissions', 403));
    }
    user.permissions = {
      ...user.permissions,
      ...req.body.permissions
    };
  }

  if (req.body.customerId !== undefined) {
    if (isSuperAdmin(requesterRole)) {
      user.customer = req.body.customerId || undefined;
    } else {
      if (user.role !== 'client' && normalizeRole(req.body.role || user.role) !== 'client') {
        return next(new ErrorResponse('Customer assignments are only for client roles', 400));
      }
      user.customer = req.body.customerId || undefined;
    }
  }

  if (req.body.isActive !== undefined) {
    user.isActive = req.body.isActive;
  }

  await user.save();

  await logAuditEntry(req, 'update-team-member', 'User', { userId: user._id, updates: req.body });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Remove team member
// @route   DELETE /api/v1/team/:id
// @access  Private (Admin)
exports.removeTeamMember = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (isProtectedAdminRole(user.role)) {
    return next(new ErrorResponse('Admin accounts cannot be deactivated', 403));
  }

  user.isActive = false;
  await user.save();

  await logAuditEntry(req, 'remove-team-member', 'User', { userId: user._id });

  res.status(200).json({
    success: true,
    message: 'Team member deactivated'
  });
});
