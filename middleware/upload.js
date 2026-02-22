const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ErrorResponse = require('../utils/errorResponse');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_DOCUMENT_FILE_SIZE_MB = parsePositiveInt(process.env.MAX_DOCUMENT_FILE_SIZE_MB, 50);
const MAX_DOCUMENT_FILE_SIZE_BYTES = MAX_DOCUMENT_FILE_SIZE_MB * 1024 * 1024;

// Ensure upload directories exist
const directories = [
  'uploads/logos',
  'uploads/products',
  'uploads/documents',
  'uploads/profile'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Set storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    if (file.fieldname === 'logo') {
      uploadPath += 'logos/';
    } else if (file.fieldname === 'productImage') {
      uploadPath += 'products/';
    } else if (file.fieldname === 'profileImage') {
      uploadPath += 'profile/';
    } else {
      uploadPath += 'documents/';
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + '-' + Date.now() + path.extname(file.originalname)
    );
  }
});

// Check file type
function checkFileType(file, cb) {
  const extensionTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|csv|txt|ppt|pptx/;
  const mimeTypes =
    /image\/|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv|text\/plain|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/;

  const extname = extensionTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = mimeTypes.test(file.mimetype);

  if (extname || mimetype) {
    return cb(null, true);
  }

  return cb(new ErrorResponse('Allowed files: images, PDF, Word, Excel, CSV, TXT, and PowerPoint.', 400));
}

// Init upload
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES },
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});

module.exports = upload;
