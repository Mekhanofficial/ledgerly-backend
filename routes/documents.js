const express = require('express');
const {
  getDocuments,
  getDocument,
  getDocumentContent,
  uploadDocument,
  updateDocument,
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
  .put(protect, authorize('admin', 'accountant', 'staff'), updateDocument)
  .delete(protect, authorize('admin', 'accountant', 'staff'), deleteDocument);

router
  .route('/:id/content')
  .get(protect, authorize('admin', 'accountant', 'staff'), getDocumentContent);

module.exports = router;
