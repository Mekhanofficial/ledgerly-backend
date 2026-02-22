const TaxSettings = require('../models/TaxSettings');

const getTaxSettings = async () => {
  let settings = await TaxSettings.findOne();
  if (!settings) {
    settings = await TaxSettings.create({});
  }
  return settings;
};

module.exports = {
  getTaxSettings
};
