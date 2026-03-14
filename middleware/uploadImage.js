const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/errorResponse');

const storage = multer.memoryStorage();

const defaultImageExtensions = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
  '.jfif'
]);
const defaultImageMimeTypes = new Set([
  'image/jpg',
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif'
]);
const logoExtensions = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
  '.jfif',
  '.svg'
]);
const logoMimeTypes = new Set([
  'image/jpg',
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/svg',
  'image/svg+xml'
]);

const isAllowedImage = (file, { allowGif = false } = {}) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extensions = allowGif ? logoExtensions : defaultImageExtensions;
  const mimeTypes = allowGif ? logoMimeTypes : defaultImageMimeTypes;

  return extensions.has(extension) && mimeTypes.has(mimetype);
};

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'profileImage' && isAllowedImage(file)) {
    cb(null, true);
    return;
  }

  if ((file.fieldname === 'image' || file.fieldname === 'productImage') && isAllowedImage(file)) {
    cb(null, true);
    return;
  }

  if (file.fieldname === 'logo' && isAllowedImage(file, { allowGif: true })) {
    cb(null, true);
    return;
  }

  if (file.fieldname === 'profileImage') {
    cb(new ErrorResponse('Profile photos must be JPG, PNG, WEBP, AVIF, HEIC, or HEIF images.', 400));
    return;
  }

  if (file.fieldname === 'logo') {
    cb(new ErrorResponse('Logo uploads must be JPG, PNG, GIF, WEBP, AVIF, HEIC, HEIF, or SVG images.', 400));
    return;
  }

  cb(new ErrorResponse('Only JPG, PNG, and WEBP image files are allowed.', 400));
};

const uploadImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2
  },
  fileFilter
});

module.exports = uploadImage;
