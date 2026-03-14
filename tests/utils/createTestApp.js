const express = require('express');

const authRoutes = require('../../routes/auth');
const businessRoutes = require('../../routes/business');
const customerRoutes = require('../../routes/customers');
const invoiceRoutes = require('../../routes/invoices');
const receiptRoutes = require('../../routes/receipts');
const errorHandler = require('../../middleware/error');

const createTestApp = () => {
  const app = express();

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/business', businessRoutes);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/invoices', invoiceRoutes);
  app.use('/api/v1/receipts', receiptRoutes);

  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Ledgerly API test server is running'
    });
  });

  app.use(errorHandler);

  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  });

  return app;
};

module.exports = createTestApp;
