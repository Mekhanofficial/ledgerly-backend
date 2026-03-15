const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ErrorResponse = require('../utils/errorResponse');

const TMP_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'tmp');
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const sanitizeFileNameSegment = (value, fallback = 'file') => {
  const parsed = path.parse(String(value || fallback));
  const base = String(parsed.name || fallback)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return base || fallback;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const extension = path.extname(String(file?.originalname || '')).toLowerCase() || '.bin';
    const safeBase = sanitizeFileNameSegment(file?.originalname || 'document', 'document');
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${safeBase}-${uniqueSuffix}${extension}`);
  }
});
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const DOCUMENT_UPLOAD_MAX_MB = parsePositiveInt(process.env.MAX_DOCUMENT_UPLOAD_MB, 50);
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
