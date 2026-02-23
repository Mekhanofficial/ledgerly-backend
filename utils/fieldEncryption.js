const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

const resolveKeyMaterial = () =>
  process.env.BUSINESS_KEYS_ENCRYPTION_KEY
  || process.env.APP_ENCRYPTION_KEY
  || process.env.SECRET_ENCRYPTION_KEY
  || process.env.JWT_SECRET
  || '';

const getEncryptionKey = () => {
  const material = resolveKeyMaterial();
  if (!material) {
    throw new Error('Encryption key is not configured');
  }

  return crypto.createHash('sha256').update(String(material)).digest();
};

const pack = (iv, tag, encrypted) => [
  'v1',
  iv.toString('base64'),
  tag.toString('base64'),
  encrypted.toString('base64')
].join(':');

const unpack = (value) => {
  const parts = String(value || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted payload format');
  }

  return {
    iv: Buffer.from(parts[1], 'base64'),
    tag: Buffer.from(parts[2], 'base64'),
    encrypted: Buffer.from(parts[3], 'base64')
  };
};

const encryptString = (plainText) => {
  if (plainText === undefined || plainText === null || plainText === '') {
    return '';
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return pack(iv, tag, encrypted);
};

const decryptString = (encryptedValue) => {
  if (!encryptedValue) return '';

  const key = getEncryptionKey();
  const { iv, tag, encrypted } = unpack(encryptedValue);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
};

const maskSecret = (value, visible = 4) => {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= visible) return '*'.repeat(text.length);
  return `${'*'.repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}`;
};

module.exports = {
  encryptString,
  decryptString,
  maskSecret
};
