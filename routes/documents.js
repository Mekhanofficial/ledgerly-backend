const express = require('express');
const {
  getDocuments,
  getDocument,
  uploadDocument,
  deleteDocument
} = require('../controllers/documentController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router
  .route('/')
  .get(protect, authorize('admin', 'accountant', 'staff'), getDocuments)
  .post(
    protect,
    authorize('admin', 'accountant', 'staff'),
    upload.single('document'),
    uploadDocument
  );

router
  .route('/:id')
  .get(protect, authorize('admin', 'accountant', 'staff'), getDocument)
  .delete(protect, authorize('admin', 'accountant', 'staff'), deleteDocument);

module.exports = router;
