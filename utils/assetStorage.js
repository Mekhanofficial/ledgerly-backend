const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ErrorResponse = require('./errorResponse');
const {
  destroyAsset,
  extractPublicIdFromUrl,
  hasCloudinaryCredentials,
  uploadBuffer,
  uploadImageBuffer
} = require('./cloudinary');

const DEFAULT_PROFILE_IMAGE = 'uploads/profile/default-avatar.png';
const LOCAL_UPLOAD_FALLBACK_ENABLED = String(process.env.LOCAL_UPLOAD_FALLBACK_ENABLED || 'true')
  .trim()
  .toLowerCase() !== 'false';

const localFolderMap = {
  profile: 'profile',
  logo: 'logos',
  product: 'products',
  document: 'documents'
};

const normalizeStoredAsset = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '');

  const uploadsMatch = normalized.match(/(?:^|\/)(uploads\/.+)$/i);
  if (uploadsMatch?.[1]) {
    return uploadsMatch[1];
  }

  return normalized;
};

const isRemoteAsset = (value) => /^https?:\/\//i.test(String(value || '').trim());

const isLocalUploadAsset = (value) => /^uploads\//i.test(normalizeStoredAsset(value));

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const sanitizeFileSegment = (value, fallback = 'asset') => {
  const baseName = path.parse(String(value || fallback)).name || fallback;
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return sanitized || fallback;
};

const mimeTypeExtensionMap = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf'
};

const resolveFileExtension = (file, fallback = '.bin') => {
  const fromOriginalName = path.extname(String(file?.originalname || '')).trim().toLowerCase();
  if (fromOriginalName) {
    return fromOriginalName;
  }

  const fromMimeType = mimeTypeExtensionMap[String(file?.mimetype || '').trim().toLowerCase()];
  return fromMimeType || fallback;
};

const resolveLocalAssetFolder = (assetType) =>
  localFolderMap[assetType] || 'assets';

const uploadLocalFile = async (
  file,
  {
    assetType = 'asset',
    fileName = '',
    resourceType = 'auto',
    extensionFallback = '.bin'
  } = {}
) => {
  if (!file?.buffer) return null;

  const folderName = resolveLocalAssetFolder(assetType);
  const uploadsRoot = path.join(__dirname, '..', 'uploads', folderName);
  await fs.promises.mkdir(uploadsRoot, { recursive: true });

  const safeBaseName = sanitizeFileSegment(fileName || file.originalname || assetType || 'asset');
  const extension = resolveFileExtension(file, extensionFallback);
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const outputFileName = `${safeBaseName}-${suffix}${extension}`;
  const outputPath = path.join(uploadsRoot, outputFileName);

  await fs.promises.writeFile(outputPath, file.buffer);

  return {
    url: normalizeStoredAsset(path.join('uploads', folderName, outputFileName)),
    publicId: '',
    resourceType
  };
};

const uploadWithLocalFallback = async (
  file,
  {
    assetType = 'asset',
    fileName = '',
    resourceType = 'auto',
    extensionFallback = '.bin',
    cloudinaryUploader
  } = {}
) => {
  if (!file?.buffer) return null;

  const fallbackToLocal = async (reason) => {
    if (!LOCAL_UPLOAD_FALLBACK_ENABLED) {
      throw reason;
    }
    console.warn('Cloudinary upload unavailable, using local uploads fallback.', {
      assetType,
      reason: reason?.message || reason
    });
    return uploadLocalFile(file, {
      assetType,
      fileName,
      resourceType,
      extensionFallback
    });
  };

  if (!hasCloudinaryCredentials()) {
    return fallbackToLocal(new ErrorResponse(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      503
    ));
  }

  try {
    return await cloudinaryUploader();
  } catch (error) {
    return fallbackToLocal(error);
  }
};

const getConfiguredServerBaseUrl = () => {
  const configured = normalizeBaseUrl(
    process.env.BACKEND_BASE_URL || process.env.SERVER_URL || ''
  );
  return configured || '';
};

const getRequestBaseUrl = (req) => {
  const configured = getConfiguredServerBaseUrl();
  if (configured) return configured;

  if (!req) return '';

  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = req.get?.('host') || req.headers?.host || '';
  if (!host) return '';
  return `${protocol}://${host}`;
};

const buildAssetUrl = (req, value) => {
  const normalized = normalizeStoredAsset(value);
  if (!normalized) return '';
  if (isRemoteAsset(normalized)) return normalized;
  if (isLocalUploadAsset(normalized)) {
    const baseUrl = getRequestBaseUrl(req);
    if (!baseUrl) return `/${normalized}`;
    return `${baseUrl}/${normalized}`;
  }
  return normalized;
};

const cloudinaryFolderMap = {
  profile: 'profiles',
  logo: 'logos',
  product: 'products',
  document: 'documents'
};

const resolveCloudinaryFolder = (assetType) => {
  const baseFolder = String(process.env.CLOUDINARY_FOLDER || 'ledgerly')
    .trim()
    .replace(/^\/+|\/+$/g, '') || 'ledgerly';

  const envFolderMap = {
    profile: process.env.CLOUDINARY_PROFILES_FOLDER,
    logo: process.env.CLOUDINARY_LOGOS_FOLDER,
    product: process.env.CLOUDINARY_PRODUCTS_FOLDER,
    document: process.env.CLOUDINARY_DOCUMENTS_FOLDER
  };

  const explicitFolder = String(envFolderMap[assetType] || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');

  if (explicitFolder) {
    return explicitFolder;
  }

  return `${baseFolder}/${cloudinaryFolderMap[assetType] || 'assets'}`;
};

const uploadCloudinaryImage = async (file, { assetType, fileName } = {}) => {
  if (!file?.buffer) return null;

  return uploadWithLocalFallback(file, {
    assetType,
    fileName: fileName || file.originalname || assetType || 'image',
    resourceType: 'image',
    extensionFallback: '.jpg',
    cloudinaryUploader: async () => {
      const uploadResult = await uploadImageBuffer(file.buffer, {
        folder: resolveCloudinaryFolder(assetType),
        fileName: fileName || file.originalname || assetType || 'image'
      });

      return {
        url: uploadResult?.secure_url || uploadResult?.url || '',
        publicId: uploadResult?.public_id || '',
        resourceType: uploadResult?.resource_type || 'image'
      };
    }
  });
};

const uploadCloudinaryFile = async (file, { assetType, fileName, resourceType = 'auto' } = {}) => {
  if (!file?.buffer) return null;

  return uploadWithLocalFallback(file, {
    assetType,
    fileName: fileName || file.originalname || assetType || 'file',
    resourceType,
    extensionFallback: '.bin',
    cloudinaryUploader: async () => {
      const uploadResult = await uploadBuffer(file.buffer, {
        folder: resolveCloudinaryFolder(assetType),
        fileName: fileName || file.originalname || assetType || 'file',
        resourceType
      });

      return {
        url: uploadResult?.secure_url || uploadResult?.url || '',
        publicId: uploadResult?.public_id || '',
        resourceType: uploadResult?.resource_type || resourceType
      };
    }
  });
};

const removeLocalAsset = async (value) => {
  const normalized = normalizeStoredAsset(value);
  if (!isLocalUploadAsset(normalized)) return;

  const absolutePath = path.join(__dirname, '..', normalized);

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    console.error('Failed to remove local asset:', error?.message || error);
  }
};

const removeStoredAsset = async ({ url, publicId, preserve = [], resourceType = 'image' } = {}) => {
  const normalized = normalizeStoredAsset(url);
  const preserved = new Set(
    preserve
      .map((value) => normalizeStoredAsset(value))
      .filter(Boolean)
  );

  if (!normalized || preserved.has(normalized)) return;

  if (isLocalUploadAsset(normalized)) {
    await removeLocalAsset(normalized);
    return;
  }

  const resolvedPublicId = String(publicId || '').trim() || extractPublicIdFromUrl(normalized);
  if (!resolvedPublicId) return;

  try {
    await destroyAsset(resolvedPublicId, { resourceType });
  } catch (error) {
    console.error('Failed to remove Cloudinary asset:', error?.message || error);
  }
};

module.exports = {
  DEFAULT_PROFILE_IMAGE,
  buildAssetUrl,
  isLocalUploadAsset,
  normalizeStoredAsset,
  removeStoredAsset,
  uploadCloudinaryFile,
  uploadCloudinaryImage
};
