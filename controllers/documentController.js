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

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
const DOCUMENT_RULES = {
  starter: {
    maxDocuments: parsePositiveInt(process.env.STARTER_MAX_DOCUMENTS, 50),
    maxStorageBytes: parsePositiveInt(process.env.STARTER_MAX_STORAGE_BYTES, 250 * MB),
    allowedExtensions: new Set(['pdf', 'jpg', 'jpeg', 'png']),
    allowImages: true,
  },
  professional: {
    maxDocuments: parsePositiveInt(process.env.PROFESSIONAL_MAX_DOCUMENTS, 1000),
    maxStorageBytes: parsePositiveInt(process.env.PROFESSIONAL_MAX_STORAGE_BYTES, 5 * GB),
    allowedExtensions: new Set(['pdf', 'docx', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'webp', 'gif']),
    allowImages: true,
  },
  enterprise: {
    maxDocuments: parsePositiveInt(process.env.ENTERPRISE_MAX_DOCUMENTS, 10000),
    maxStorageBytes: parsePositiveInt(process.env.ENTERPRISE_MAX_STORAGE_BYTES, 50 * GB),
    allowedExtensions: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'gif']),
    allowImages: true,
  },
};

const resolveDocumentRules = (plan) => {
  const planId = normalizePlanId(plan);
  if (planId === 'professional' || planId === 'enterprise') {
    return DOCUMENT_RULES[planId];
  }
  return DOCUMENT_RULES.starter;
};

const isDocumentTypeAllowed = (rules, mimeType, extension) => {
  const mime = String(mimeType || '').toLowerCase();
  const ext = String(extension || '').toLowerCase();
  if (rules.allowedExtensions.has(ext)) return true;
  if (rules.allowImages && mime.startsWith('image/')) return true;
  return false;
};

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
  const documentRules = resolveDocumentRules(effectivePlan);

  const originalName = req.file.originalname || '';
  const extension = path.extname(originalName).replace('.', '').toLowerCase();
  const fileSize = Number(req.file.size) || 0;

  if (!isDocumentTypeAllowed(documentRules, req.file.mimetype, extension)) {
    removeFile(req.file.path);
    return next(
      new ErrorResponse(
        'File type is not allowed for your plan.',
        400
      )
    );
  }

  const [usage] = await Document.aggregate([
    { $match: { business: business._id } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalSize: { $sum: { $ifNull: ['$size', 0] } }
      }
    }
  ]);

  const existingCount = Number(usage?.count || 0);
  const existingStorage = Number(usage?.totalSize || 0);
  if (existingCount >= documentRules.maxDocuments) {
    removeFile(req.file.path);
    return next(
      new ErrorResponse(
        `Document limit reached for your plan (${documentRules.maxDocuments}). Upgrade to upload more.`,
        403
      )
    );
  }

  if (existingStorage + fileSize > documentRules.maxStorageBytes) {
    removeFile(req.file.path);
    return next(
      new ErrorResponse(
        `Storage limit reached for your plan (${Math.round(documentRules.maxStorageBytes / MB)}MB).`,
        403
      )
    );
  }

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
