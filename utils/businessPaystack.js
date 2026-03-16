const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const buildHeaders = (secretKey) => ({
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json'
});

const toPaystackError = (error) => {
  if (error?.statusCode && error?.message) {
    return error;
  }

  const responseData = error?.response?.data || null;
  const responseStatus = Number(error?.response?.status || 500);
  const responseCode = String(responseData?.code || '').trim().toLowerCase();
  const responseType = String(responseData?.type || '').trim().toLowerCase();
  const normalized = new Error(
    responseData?.message
    || error?.message
    || 'Paystack request failed'
  );

  normalized.statusCode = responseStatus >= 500
    ? 502
    : (responseType === 'validation_error' || responseCode === 'unsupported_currency')
      ? 400
      : responseStatus;
  normalized.paystackStatusCode = responseStatus;
  normalized.paystackResponse = responseData;
  return normalized;
};

const initializeBusinessTransaction = async (secretKey, payload) => {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      payload,
      {
        headers: buildHeaders(secretKey)
      }
    );

    return response.data;
  } catch (error) {
    throw toPaystackError(error);
  }
};

const verifyBusinessTransaction = async (secretKey, reference) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: buildHeaders(secretKey)
      }
    );

    return response.data;
  } catch (error) {
    throw toPaystackError(error);
  }
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
