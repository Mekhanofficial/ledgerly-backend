const fs = require('fs');
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

const buildAssetUrl = (req, value) => {
  const normalized = normalizeStoredAsset(value);
  if (!normalized) return '';
  if (isRemoteAsset(normalized)) return normalized;
  if (isLocalUploadAsset(normalized)) {
    return `${req.protocol}://${req.get('host')}/${normalized}`;
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
  if (!hasCloudinaryCredentials()) {
    throw new ErrorResponse(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      503
    );
  }

  const uploadResult = await uploadImageBuffer(file.buffer, {
    folder: resolveCloudinaryFolder(assetType),
    fileName: fileName || file.originalname || assetType || 'image'
  });

  return {
    url: uploadResult?.secure_url || uploadResult?.url || '',
    publicId: uploadResult?.public_id || '',
    resourceType: uploadResult?.resource_type || 'image'
  };
};

const uploadCloudinaryFile = async (file, { assetType, fileName, resourceType = 'auto' } = {}) => {
  if (!file?.buffer) return null;
  if (!hasCloudinaryCredentials()) {
    throw new ErrorResponse(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      503
    );
  }

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
