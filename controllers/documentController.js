const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Document = require('../models/Document');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { normalizePlanId } = require('../utils/planConfig');
const { resolveBillingOwner, resolveEffectivePlan } = require('../utils/subscriptionService');
const {
  buildAssetUrl,
  isLocalUploadAsset,
  normalizeStoredAsset,
  removeStoredAsset,
  uploadCloudinaryFile
} = require('../utils/assetStorage');
const {
  buildPrivateDownloadUrl,
  hasCloudinaryCredentials
} = require('../utils/cloudinary');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
const DOCUMENT_PROXY_TIMEOUT_MS = parsePositiveInt(
  process.env.DOCUMENT_PROXY_TIMEOUT_MS,
  30_000
);
const DOCUMENT_SIGNED_DOWNLOAD_TTL_SECONDS = parsePositiveInt(
  process.env.DOCUMENT_SIGNED_DOWNLOAD_TTL_SECONDS,
  120
);

const cleanupTemporaryUploadFile = async (file) => {
  const temporaryPath = String(file?.path || '').trim();
  if (!temporaryPath) return;
  try {
    await fs.promises.unlink(temporaryPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Failed to remove temporary uploaded file:', error?.message || error);
    }
  }
};

const DOCUMENT_RULES = {
  starter: {
    maxDocuments: parsePositiveInt(process.env.STARTER_MAX_DOCUMENTS, 50),
    maxStorageBytes: parsePositiveInt(process.env.STARTER_MAX_STORAGE_BYTES, 250 * MB),
    allowedExtensions: new Set(['pdf', 'jpg', 'jpeg', 'png']),
    allowImages: true,
    allowFolderOrganization: false,
    allowAdvancedTagging: false,
    allowExportArchiveTools: false
  },
  professional: {
    maxDocuments: parsePositiveInt(process.env.PROFESSIONAL_MAX_DOCUMENTS, 1000),
    maxStorageBytes: parsePositiveInt(process.env.PROFESSIONAL_MAX_STORAGE_BYTES, 5 * GB),
    allowedExtensions: new Set(['pdf', 'docx', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'webp', 'gif']),
    allowImages: true,
    allowFolderOrganization: false,
    allowAdvancedTagging: false,
    allowExportArchiveTools: false
  },
  enterprise: {
    maxDocuments: parsePositiveInt(process.env.ENTERPRISE_MAX_DOCUMENTS, 10000),
    maxStorageBytes: parsePositiveInt(process.env.ENTERPRISE_MAX_STORAGE_BYTES, 50 * GB),
    allowedExtensions: new Set([
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'csv',
      'txt',
      'ppt',
      'pptx',
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif'
    ]),
    allowImages: true,
    allowFolderOrganization: true,
    allowAdvancedTagging: true,
    allowExportArchiveTools: true
  }
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

const normalizeFolderName = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 100);

const parseTagList = (value) => {
  const rawTags = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  const normalized = rawTags
    .flatMap((entry) => String(entry || '').split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => entry.replace(/\s+/g, '-').slice(0, 32))
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 20);
};

const normalizeDocumentFilePath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const uploadsMatch = parsed.pathname.match(/\/uploads\/.+$/i);
      if (uploadsMatch?.[0]) {
        return uploadsMatch[0].replace(/^\/+/, '');
      }
    } catch {
      // Keep legacy non-url strings untouched below.
    }
  }

  const normalized = normalizeStoredAsset(raw)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '');

  const uploadsMatch = normalized.match(/(?:^|\/)(uploads\/.+)$/i);
  if (uploadsMatch?.[1]) {
    return uploadsMatch[1];
  }

  const apiUploadsMatch = normalized.match(/(?:^|\/)api\/v\d+\/(uploads\/.+)$/i);
  if (apiUploadsMatch?.[1]) {
    return apiUploadsMatch[1];
  }

  return normalized;
};

const resolveDocumentFileUrl = (req, value) => {
  const normalizedPath = normalizeDocumentFilePath(value);
  if (!normalizedPath) return '';
  return buildAssetUrl(req, normalizedPath);
};

const resolveSafeFileName = (document) => {
  const candidate = document?.fileName || document?.originalName || document?.name || 'document';
  return String(candidate)
    .replace(/[\r\n"]/g, '')
    .trim() || 'document';
};

const DOCUMENT_MIME_EXTENSION_MAP = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

const resolveDocumentFormat = (document = {}) => {
  const fileNameCandidates = [
    document.fileName,
    document.originalName,
    document.name
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of fileNameCandidates) {
    const extension = path.extname(candidate).replace('.', '').toLowerCase();
    if (extension) return extension;
  }

  const mimeType = String(document.mimeType || '').trim().toLowerCase();
  return DOCUMENT_MIME_EXTENSION_MAP[mimeType] || '';
};

const tryFetchDocumentStream = async (url) => axios.get(url, {
  responseType: 'stream',
  timeout: DOCUMENT_PROXY_TIMEOUT_MS,
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400
});

const getDocumentRulesForUser = async (user) => {
  const billingOwner = await resolveBillingOwner(user);
  const effectivePlan = resolveEffectivePlan(billingOwner);
  return resolveDocumentRules(effectivePlan);
};

const getAuthorizedDocument = async (req, next) => {
  const document = await Document.findById(req.params.id);
  if (!document) {
    next(new ErrorResponse('Document not found', 404));
    return null;
  }
  if (document.business.toString() !== req.user.business.toString()) {
    next(new ErrorResponse('Not authorized to access this document', 403));
    return null;
  }
  return document;
};

const mapDocumentResponse = (doc, req) => {
  const normalizedFilePath = normalizeDocumentFilePath(doc.filePath);
  return {
    id: doc._id,
    name: doc.name,
    originalName: doc.originalName,
    fileName: doc.fileName,
    filePath: normalizedFilePath,
    fileUrl: resolveDocumentFileUrl(req, normalizedFilePath),
    mimeType: doc.mimeType,
    size: doc.size,
    type: doc.type,
    folder: doc.folder || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    isArchived: Boolean(doc.isArchived),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    uploadedBy: doc.uploadedBy
  };
};

// @desc    Get documents
// @route   GET /api/v1/documents
// @access  Private
exports.getDocuments = asyncHandler(async (req, res) => {
  const includeArchived = String(req.query.includeArchived || '')
    .trim()
    .toLowerCase() === 'true';
  const search = String(req.query.search || '').trim();
  const folder = normalizeFolderName(req.query.folder);
  const tag = String(req.query.tag || '').trim().toLowerCase();

  const query = { business: req.user.business };
  if (!includeArchived) {
    query.isArchived = { $ne: true };
  }
  if (search) {
    query.name = { $regex: escapeRegex(search), $options: 'i' };
  }
  if (folder) {
    query.folder = folder;
  }
  if (tag) {
    query.tags = tag;
  }

  const documents = await Document.find(query).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: documents.length,
    data: documents.map((document) => mapDocumentResponse(document, req))
  });
});

// @desc    Get single document
// @route   GET /api/v1/documents/:id
// @access  Private
exports.getDocument = asyncHandler(async (req, res, next) => {
  const document = await getAuthorizedDocument(req, next);
  if (!document) return;

  res.status(200).json({
    success: true,
    data: mapDocumentResponse(document, req)
  });
});

// @desc    Stream single document file
// @route   GET /api/v1/documents/:id/content
// @access  Private
exports.getDocumentContent = asyncHandler(async (req, res, next) => {
  const document = await getAuthorizedDocument(req, next);
  if (!document) return;

  const normalizedFilePath = normalizeDocumentFilePath(document.filePath);
  if (!normalizedFilePath) {
    return next(new ErrorResponse('Document file is missing', 404));
  }

  if (isLocalUploadAsset(normalizedFilePath)) {
    const absolutePath = path.join(__dirname, '..', normalizedFilePath);
    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
    } catch {
      return next(new ErrorResponse('Document file not found in storage', 404));
    }

    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${resolveSafeFileName(document)}"`);
    return res.sendFile(absolutePath);
  }

  const fileUrl = resolveDocumentFileUrl(req, normalizedFilePath);
  if (!/^https?:\/\//i.test(fileUrl)) {
    return next(new ErrorResponse('Document file URL is invalid', 404));
  }

  let upstreamResponse;
  try {
    upstreamResponse = await tryFetchDocumentStream(fileUrl);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const canTrySignedCloudinaryUrl = Boolean(
      hasCloudinaryCredentials()
      && document?.filePublicId
      && (status === 401 || status === 403 || status === 404)
    );

    if (canTrySignedCloudinaryUrl) {
      const format = resolveDocumentFormat(document);
      if (format) {
        try {
          const signedUrl = buildPrivateDownloadUrl(document.filePublicId, format, {
            resourceType: String(document.fileResourceType || '').trim() || 'raw',
            type: 'upload',
            attachment: false,
            expiresInSeconds: DOCUMENT_SIGNED_DOWNLOAD_TTL_SECONDS
          });

          if (signedUrl) {
            upstreamResponse = await tryFetchDocumentStream(signedUrl);
          }
        } catch (signedFetchError) {
          if (Number(signedFetchError?.response?.status || 0) === 404) {
            return next(new ErrorResponse('Document file not found in storage', 404));
          }
          return next(new ErrorResponse('Failed to load document content', 502));
        }
      }
    }

    if (!upstreamResponse && status === 404) {
      return next(new ErrorResponse('Document file not found in storage', 404));
    }
    if (!upstreamResponse) {
      return next(new ErrorResponse('Failed to load document content', 502));
    }
  }

  res.setHeader(
    'Content-Type',
    document.mimeType || upstreamResponse.headers['content-type'] || 'application/octet-stream'
  );
  if (upstreamResponse.headers['content-length']) {
    res.setHeader('Content-Length', upstreamResponse.headers['content-length']);
  }
  res.setHeader('Content-Disposition', `inline; filename="${resolveSafeFileName(document)}"`);
  upstreamResponse.data.pipe(res);
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

  const documentRules = await getDocumentRulesForUser(req.user);
  const originalName = req.file.originalname || '';
  const extension = path.extname(originalName).replace('.', '').toLowerCase();
  const fileSize = Number(req.file.size) || 0;

  if (!isDocumentTypeAllowed(documentRules, req.file.mimetype, extension)) {
    return next(new ErrorResponse('File type is not allowed for your plan.', 400));
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
    return next(
      new ErrorResponse(
        `Document limit reached for your plan (${documentRules.maxDocuments}). Upgrade to upload more.`,
        403
      )
    );
  }

  if (existingStorage + fileSize > documentRules.maxStorageBytes) {
    return next(
      new ErrorResponse(
        `Storage limit reached for your plan (${Math.round(documentRules.maxStorageBytes / MB)}MB).`,
        403
      )
    );
  }

  const resolvedName = (req.body.name || originalName || 'Untitled document').toString().trim();
  const uploadResourceType = String(req.file.mimetype || '').toLowerCase().startsWith('image/')
    ? 'image'
    : 'raw';
  let uploadedFile = null;
  let document;
  try {
    uploadedFile = await uploadCloudinaryFile(req.file, {
      assetType: 'document',
      fileName: resolvedName || originalName || 'document',
      resourceType: uploadResourceType
    });

    document = await Document.create({
      business: business._id,
      uploadedBy: req.user.id,
      name: resolvedName,
      originalName,
      fileName: originalName || req.file.originalname,
      filePath: normalizeDocumentFilePath(uploadedFile?.url),
      filePublicId: uploadedFile?.publicId || '',
      fileResourceType: uploadedFile?.resourceType || uploadResourceType,
      mimeType: req.file.mimetype,
      size: req.file.size,
      type: req.body.type === 'scan' ? 'scan' : 'document',
      folder: documentRules.allowFolderOrganization ? normalizeFolderName(req.body.folder) : '',
      tags: documentRules.allowAdvancedTagging ? parseTagList(req.body.tags) : []
    });
  } catch (error) {
    if (uploadedFile?.url) {
      await removeStoredAsset({
        url: uploadedFile.url,
        publicId: uploadedFile.publicId,
        resourceType: uploadedFile.resourceType || 'raw'
      });
    }
    throw error;
  } finally {
    await cleanupTemporaryUploadFile(req.file);
  }

  res.status(201).json({
    success: true,
    data: mapDocumentResponse(document, req)
  });
});

// @desc    Update document metadata
// @route   PUT /api/v1/documents/:id
// @access  Private
exports.updateDocument = asyncHandler(async (req, res, next) => {
  const document = await getAuthorizedDocument(req, next);
  if (!document) return;

  const documentRules = await getDocumentRulesForUser(req.user);
  const updates = {};

  if (req.body.name !== undefined) {
    const normalizedName = String(req.body.name || '').trim();
    if (!normalizedName) {
      return next(new ErrorResponse('Document name cannot be empty', 400));
    }
    updates.name = normalizedName;
  }

  if (req.body.folder !== undefined) {
    if (!documentRules.allowFolderOrganization) {
      return next(new ErrorResponse('Folder organization is available on Enterprise plan.', 403));
    }
    updates.folder = normalizeFolderName(req.body.folder);
  }

  if (req.body.tags !== undefined) {
    if (!documentRules.allowAdvancedTagging) {
      return next(new ErrorResponse('Advanced tagging is available on Enterprise plan.', 403));
    }
    updates.tags = parseTagList(req.body.tags);
  }

  if (req.body.isArchived !== undefined) {
    if (!documentRules.allowExportArchiveTools) {
      return next(new ErrorResponse('Archive tools are available on Enterprise plan.', 403));
    }
    updates.isArchived = Boolean(req.body.isArchived);
  }

  if (!Object.keys(updates).length) {
    return res.status(200).json({
      success: true,
      data: mapDocumentResponse(document, req)
    });
  }

  Object.assign(document, updates);
  await document.save();

  res.status(200).json({
    success: true,
    data: mapDocumentResponse(document, req)
  });
});

// @desc    Delete document
// @route   DELETE /api/v1/documents/:id
// @access  Private
exports.deleteDocument = asyncHandler(async (req, res, next) => {
  const document = await getAuthorizedDocument(req, next);
  if (!document) return;

  const normalizedFilePath = normalizeDocumentFilePath(document.filePath);
  await document.deleteOne();
  await removeStoredAsset({
    url: normalizedFilePath,
    publicId: document.filePublicId,
    resourceType: document.fileResourceType || 'raw'
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});
