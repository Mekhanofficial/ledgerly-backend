const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRole, isSuperAdmin } = require('../utils/rolePermissions');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User account is deactivated'
      });
    }
    
    req.user = user;
    req.user.effectiveRole = normalizeRole(user.role);
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    const effectiveRole = req.user?.effectiveRole || normalizeRole(req.user?.role);
    if (isSuperAdmin(effectiveRole)) {
      return next();
    }

    const allowedRoles = roles.map((role) => normalizeRole(role));
    if (!allowedRoles.includes(effectiveRole)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Business owner middleware
exports.businessOwner = async (req, res, next) => {
  const effectiveRole = req.user?.effectiveRole || normalizeRole(req.user?.role);
  if (isSuperAdmin(effectiveRole) || effectiveRole === 'admin' || req.user.business.toString() === req.params.businessId) {
    next();
  } else {
    res.status(403).json({
      success: false,
      error: 'Not authorized as business owner'
    });
  }
};
