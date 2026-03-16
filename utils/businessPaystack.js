const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const buildHeaders = (secretKey) => ({
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json'
});

const initializeBusinessTransaction = async (secretKey, payload) => {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    payload,
    {
      headers: buildHeaders(secretKey)
    }
  );

  return response.data;
};

const verifyBusinessTransaction = async (secretKey, reference) => {
  const response = await axios.get(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: buildHeaders(secretKey)
    }
  );

  return response.data;
};

const verifyPaystackSignatureWithSecret = (rawBody, signature, secretKey) => {
  if (!rawBody || !signature || !secretKey) return false;
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
};

module.exports = {
  initializeBusinessTransaction,
  verifyBusinessTransaction,
  verifyPaystackSignatureWithSecret
};
