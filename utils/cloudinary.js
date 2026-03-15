const crypto = require('crypto');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const readEnv = (name) => String(process.env[name] || '').trim();

const getCloudinaryConfig = () => ({
  cloudName: readEnv('CLOUDINARY_CLOUD_NAME'),
  apiKey: readEnv('CLOUDINARY_API_KEY'),
  apiSecret: readEnv('CLOUDINARY_API_SECRET')
});

let isConfigured = false;

const hasCloudinaryCredentials = () => {
  const config = getCloudinaryConfig();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
};

const ensureCloudinaryConfigured = () => {
  if (!hasCloudinaryCredentials()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  if (!isConfigured) {
    const config = getCloudinaryConfig();
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true
    });
    isConfigured = true;
  }
};

const sanitizePublicIdSegment = (value, fallback = 'image') => {
  const baseName = path.parse(String(value || fallback)).name || fallback;
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${sanitized || fallback}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
};

const uploadBuffer = (buffer, { folder, fileName, resourceType = 'image' } = {}) =>
  new Promise((resolve, reject) => {
    ensureCloudinaryConfigured();

    const options = {
      resource_type: resourceType,
      overwrite: false,
      public_id: sanitizePublicIdSegment(fileName)
    };

    if (folder) {
      options.folder = folder;
    }

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    stream.on('error', reject);
    stream.end(buffer);
  });

const uploadImageBuffer = (buffer, options = {}) =>
  uploadBuffer(buffer, {
    ...options,
    resourceType: 'image'
  });

const buildPrivateDownloadUrl = (
  publicId,
  format,
  {
    resourceType = 'raw',
    type = 'upload',
    attachment = false,
    expiresInSeconds = 120
  } = {}
) => {
  const normalizedPublicId = String(publicId || '').trim();
  const normalizedFormat = String(format || '').trim().replace(/^\./, '');
  if (!normalizedPublicId || !normalizedFormat) {
    return '';
  }

  ensureCloudinaryConfigured();

  const ttlSeconds = Number.parseInt(String(expiresInSeconds ?? ''), 10);
  const expiresAt = Number.isFinite(ttlSeconds) && ttlSeconds > 0
    ? Math.floor(Date.now() / 1000) + ttlSeconds
    : undefined;

  return cloudinary.utils.private_download_url(
    normalizedPublicId,
    normalizedFormat,
    {
      resource_type: resourceType,
      type,
      attachment,
      ...(expiresAt ? { expires_at: expiresAt } : {})
    }
  );
};

const destroyAsset = async (publicId, { resourceType = 'image' } = {}) => {
  const normalizedPublicId = String(publicId || '').trim();
  if (!normalizedPublicId) return null;

  ensureCloudinaryConfigured();
  return cloudinary.uploader.destroy(normalizedPublicId, {
    resource_type: resourceType,
    invalidate: true
  });
};

const destroyImage = async (publicId) =>
  destroyAsset(publicId, { resourceType: 'image' });

const extractPublicIdFromUrl = (value) => {
  const url = String(value || '').trim().split('?')[0];
  if (!/^https?:\/\//i.test(url) || !url.includes('/upload/')) {
    return '';
  }

  const match = url.match(/\/(?:image|video|raw|auto)\/upload\/(?:[^/]+\/)*(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
  return match?.[1] || '';
};

module.exports = {
  buildPrivateDownloadUrl,
  destroyAsset,
  destroyImage,
  ensureCloudinaryConfigured,
  extractPublicIdFromUrl,
  getCloudinaryConfig,
  hasCloudinaryCredentials,
  uploadBuffer,
  uploadImageBuffer
};
