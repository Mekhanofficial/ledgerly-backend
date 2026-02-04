const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
  // Allowed ext
  const filetypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images, PDFs and Documents only!');
  }
}

// Init upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});

module.exports = upload;
