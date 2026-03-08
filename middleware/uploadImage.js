const fs = require('fs');
const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/errorResponse');

const uploadDirectory = path.join(process.cwd(), 'uploads', 'products');

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirectory);
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, uniqueName);
  }
});

const allowedExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();

  if (allowedExtensions.has(extension) && allowedMimeTypes.has(mimetype)) {
    cb(null, true);
    return;
  }

  cb(new ErrorResponse('Only JPG, PNG, and WEBP image files are allowed.', 400));
};

const uploadImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter
});

module.exports = uploadImage;
