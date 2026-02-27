const nodemailer = require('nodemailer');
const { getMailerTransportConfig } = require('../config/email');

let lastConfigKey = '';
let cachedTransporter = null;

const serializeConfig = (config) => JSON.stringify(config || {});

const getTransporter = () => {
  const mailConfig = getMailerTransportConfig();
  if (!mailConfig) {
    return null;
  }

  const nextKey = serializeConfig(mailConfig);
  if (!cachedTransporter || nextKey !== lastConfigKey) {
    cachedTransporter = nodemailer.createTransport(mailConfig);
    lastConfigKey = nextKey;
  }

  return cachedTransporter;
};

module.exports = {
  getTransporter
};
