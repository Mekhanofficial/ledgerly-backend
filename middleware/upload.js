const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/errorResponse');

const storage = multer.memoryStorage();
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const DOCUMENT_UPLOAD_MAX_MB = parsePositiveInt(process.env.MAX_DOCUMENT_UPLOAD_MB, 25);
const DOCUMENT_UPLOAD_MAX_BYTES = DOCUMENT_UPLOAD_MAX_MB * 1024 * 1024;

// Check file type
function checkFileType(file, cb) {
  const imageExtensions = /jpeg|jpg|png|gif|webp/;
  const imageMimeTypes = /image\//;

  const profileExtensions = /jpeg|jpg|png|webp/;
  const profileMimeTypes = /^image\/(jpeg|png|webp)$/i;

  const documentExtensions = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|csv|txt|ppt|pptx/;
  const documentMimeTypes =
    /image\/|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv|text\/plain|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/;

  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mime = String(file.mimetype || '').toLowerCase();

  if (file.fieldname === 'profileImage') {
    if (profileExtensions.test(ext) && profileMimeTypes.test(mime)) {
      return cb(null, true);
    }
    return cb(new ErrorResponse('Profile photos must be JPG, PNG, or WEBP images.', 400));
  }

  if (file.fieldname === 'logo' || file.fieldname === 'productImage') {
    if (imageExtensions.test(ext) && imageMimeTypes.test(mime)) {
      return cb(null, true);
    }
    return cb(new ErrorResponse('Only image files are allowed for this upload.', 400));
  }

  if (documentExtensions.test(ext) && documentMimeTypes.test(mime)) {
    return cb(null, true);
  }

  return cb(new ErrorResponse('Allowed files: images, PDF, Word, Excel, CSV, TXT, and PowerPoint.', 400));
}

// Init upload
const upload = multer({
  storage,
  limits: {
    fileSize: DOCUMENT_UPLOAD_MAX_BYTES
  },
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});

module.exports = upload;
