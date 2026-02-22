const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { normalizePlanId } = require('../utils/planConfig');
const { resolveBillingOwner, resolveEffectivePlan } = require('../utils/subscriptionService');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const FREE_DOCUMENT_LIMIT = parsePositiveInt(process.env.FREE_PLAN_DOCUMENT_LIMIT, 5);

const isFreePlan = (plan) => normalizePlanId(plan) === 'starter';

const resolveFilePath = (filePath) => {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(process.cwd(), filePath);
};

const removeFile = (filePath) => {
  const absolutePath = resolveFilePath(filePath);
  if (!absolutePath) return;
  fs.unlink(absolutePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to remove document file:', err);
    }
  });
};

const mapDocumentResponse = (doc) => ({
  id: doc._id,
  name: doc.name,
  originalName: doc.originalName,
  fileName: doc.fileName,
  filePath: doc.filePath,
  mimeType: doc.mimeType,
  size: doc.size,
  type: doc.type,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  uploadedBy: doc.uploadedBy
});

// @desc    Get documents
// @route   GET /api/v1/documents
// @access  Private
exports.getDocuments = asyncHandler(async (req, res) => {
  const documents = await Document.find({ business: req.user.business })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: documents.length,
    data: documents.map(mapDocumentResponse)
  });
});

// @desc    Get single document
// @route   GET /api/v1/documents/:id
// @access  Private
exports.getDocument = asyncHandler(async (req, res, next) => {
  const document = await Document.findById(req.params.id);
  if (!document) {
    return next(new ErrorResponse('Document not found', 404));
  }
  if (document.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to access this document', 403));
  }

  res.status(200).json({
    success: true,
    data: mapDocumentResponse(document)
  });
});

// @desc    Upload document
// @route   POST /api/v1/documents
// @access  Private
exports.uploadDocument = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a document file', 400));
  }

  const business = await Business.findById(req.user.business);
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const billingOwner = await resolveBillingOwner(req.user);
  const effectivePlan = resolveEffectivePlan(billingOwner);
  if (isFreePlan(effectivePlan)) {
    const count = await Document.countDocuments({ business: business._id });
    if (count >= FREE_DOCUMENT_LIMIT) {
      return next(
        new ErrorResponse(
          `Free plan limit reached. Upgrade to upload more than ${FREE_DOCUMENT_LIMIT} documents.`,
          403
        )
      );
    }
  }

  const originalName = req.file.originalname || '';
  const resolvedName = (req.body.name || originalName || 'Untitled document').toString().trim();
  const filePath = req.file.path.split(path.sep).join('/');

  const document = await Document.create({
    business: business._id,
    uploadedBy: req.user.id,
    name: resolvedName,
    originalName,
    fileName: req.file.filename,
    filePath,
    mimeType: req.file.mimetype,
    size: req.file.size,
    type: req.body.type === 'scan' ? 'scan' : 'document'
  });

  res.status(201).json({
    success: true,
    data: mapDocumentResponse(document)
  });
});

// @desc    Delete document
// @route   DELETE /api/v1/documents/:id
// @access  Private
exports.deleteDocument = asyncHandler(async (req, res, next) => {
  const document = await Document.findById(req.params.id);
  if (!document) {
    return next(new ErrorResponse('Document not found', 404));
  }
  if (document.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to delete this document', 403));
  }

  await document.deleteOne();
  removeFile(document.filePath);

  res.status(200).json({
    success: true,
    data: {}
  });
});
