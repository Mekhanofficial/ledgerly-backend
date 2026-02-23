const https = require('https');
const crypto = require('crypto');

const PAYSTACK_HOST = 'api.paystack.co';

const getSecretKey = () => process.env.PAYSTACK_SECRET_KEY;

const requestPaystack = (method, path, payload = null) => new Promise((resolve, reject) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    const error = new Error('PAYSTACK_SECRET_KEY is not configured');
    error.statusCode = 500;
    return reject(error);
  }

  const body = payload ? JSON.stringify(payload) : null;
  const options = {
    hostname: PAYSTACK_HOST,
    path,
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.headers['Content-Length'] = Buffer.byteLength(body);
  }

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data || '{}');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const message = parsed?.message || `Paystack error (${res.statusCode})`;
          const error = new Error(message);
          error.statusCode = res.statusCode >= 500 ? 502 : (res.statusCode || 500);
          error.paystackStatusCode = res.statusCode || 500;
          error.paystackResponse = parsed;
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    });
  });

  req.on('error', reject);
  if (body) {
    req.write(body);
  }
  req.end();
});

const initializeTransaction = (payload) =>
  requestPaystack('POST', '/transaction/initialize', payload);

const verifyTransaction = (reference) =>
  requestPaystack('GET', `/transaction/verify/${encodeURIComponent(reference)}`);

const resolvePlanCode = (planId, billingCycle = 'monthly') => {
  const normalized = String(planId || '').toUpperCase();
  const cycle = billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY';
  const specificKey = `PAYSTACK_PLAN_${normalized}_${cycle}`;
  const genericKey = `PAYSTACK_PLAN_${normalized}`;
  return process.env[specificKey] || process.env[genericKey] || null;
};

const resolveCurrency = (fallback = 'NGN') => {
  const currency = process.env.PAYSTACK_CURRENCY || fallback;
  return String(currency).trim().toUpperCase();
};

const verifySignature = (rawBody, signature) => {
  const secretKey = getSecretKey();
  if (!secretKey || !rawBody || !signature) return false;
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
  resolvePlanCode,
  resolveCurrency,
  verifySignature
};
