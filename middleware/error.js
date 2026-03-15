const ErrorResponse = require('../utils/errorResponse');
const { captureException } = require('../utils/monitoring');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DOCUMENT_UPLOAD_MAX_MB = parsePositiveInt(process.env.MAX_DOCUMENT_UPLOAD_MB, 50);
const IMAGE_UPLOAD_MAX_MB = parsePositiveInt(process.env.MAX_IMAGE_UPLOAD_MB, 10);
const IMAGE_UPLOAD_FIELDS = new Set(['profileImage', 'image', 'productImage', 'logo']);

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.log(err.stack);
  captureException(err, {
    request: {
      method: req?.method,
      path: req?.originalUrl || req?.url,
      ip: req?.ip,
      userId: req?.user?.id || req?.user?._id,
      businessId: req?.user?.business,
    },
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value entered for ${field}`;
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ErrorResponse(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ErrorResponse(message, 401);
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const field = String(err.field || '').trim();
      const imageUploadError = IMAGE_UPLOAD_FIELDS.has(field);
      const message = imageUploadError
        ? `File is too large. Maximum allowed image upload size is ${IMAGE_UPLOAD_MAX_MB}MB.`
        : field
          ? `File is too large. Maximum allowed upload size is ${DOCUMENT_UPLOAD_MAX_MB}MB.`
          : `File is too large. Maximum upload size is ${IMAGE_UPLOAD_MAX_MB}MB for images and ${DOCUMENT_UPLOAD_MAX_MB}MB for documents.`;
      error = new ErrorResponse(
        message,
        400
      );
    } else {
      error = new ErrorResponse(err.message || 'File upload failed', 400);
    }
  }

  if (err.type === 'entity.too.large') {
    error = new ErrorResponse(
      'Request payload is too large. Please reduce attachment size and try again.',
      413
    );
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
  });
};

module.exports = errorHandler;
