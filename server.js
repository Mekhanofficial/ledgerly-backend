const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { resetMonthlyInvoiceCounts } = require('./utils/subscriptionService');
const { processDueRecurringInvoices } = require('./utils/recurringInvoiceService');
const { getEmailConfig, isEmailConfigured } = require('./config/email');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '250mb';

// Body parser (capture raw body for webhook verification)
app.use(express.json({
  limit: REQUEST_BODY_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// Enable CORS
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];
const appOrigins = [process.env.FRONTEND_URL, process.env.REACT_APP_URL]
  .map((origin) => (origin ? origin.trim() : ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:7000',
  'http://localhost:19006',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ledgerly-weld.vercel.app',
  ...appOrigins,
  ...envOrigins
];

const allowedOriginPatterns = [
  /^https:\/\/.*\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/
];

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-API-Key', 'Idempotency-Key'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
  // Allow uploaded files to be embedded from frontend origins.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Static folder (allow cross-origin image loading from the frontend)
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

// Route files
const auth = require('./routes/auth');
const business = require('./routes/business');
const categories = require('./routes/categories');
const customers = require('./routes/customers');
const stockAdjustments = require('./routes/stockAdjustments');
const suppliers = require('./routes/suppliers');
const products = require('./routes/products');
const invoices = require('./routes/invoices');
const receipts = require('./routes/receipts');
const payments = require('./routes/payments');
const reports = require('./routes/reports');
const team = require('./routes/team');
const settings = require('./routes/settings');
const templates = require('./routes/templates');
const superAdmin = require('./routes/superAdmin');
const taxSettings = require('./routes/taxSettings');
const billing = require('./routes/billing');
const documents = require('./routes/documents');
const webhooks = require('./routes/webhooks');
const partner = require('./routes/partner');

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/business', business);
app.use('/api/v1/categories', categories);
app.use('/api/v1/customers', customers);
app.use('/api/v1/inventory/stock-adjustments', stockAdjustments);
app.use('/api/v1/suppliers', suppliers);
app.use('/api/v1/products', products);
app.use('/api/v1/invoices', invoices);
app.use('/api/v1/receipts', receipts);
app.use('/api/v1/payments', payments);
app.use('/api/v1/reports', reports);
app.use('/api/v1/team', team);
app.use('/api/v1/settings', settings);
app.use('/api/v1/templates', templates);
app.use('/api/v1/super-admin', superAdmin);
app.use('/api/v1/tax-settings', taxSettings);
app.use('/api/v1/billing', billing);
app.use('/api/v1/documents', documents);
app.use('/api/v1/webhooks', webhooks);
app.use('/api/v1/partner', partner);

// Health check
app.get('/health', (req, res) => {
  const commit = process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || process.env.COMMIT_SHA
    || '';

  res.status(200).json({
    success: true,
    message: 'Ledgerly API is running',
    timestamp: new Date().toISOString(),
    version: commit ? commit.slice(0, 12) : 'unknown'
  });
});

// Error handling middleware
const errorHandler = require('./middleware/error');
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

const PORT = process.env.PORT || 7000;
const maskEmail = (value) => {
  const email = String(value || '').trim();
  if (!email.includes('@')) return email ? '***' : '';
  const [name, domain] = email.split('@');
  if (!name) return `***@${domain}`;
  const visible = name.slice(0, 2);
  return `${visible}***@${domain}`;
};

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  const commit = process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || process.env.COMMIT_SHA
    || '';
  console.log('Deployment version:', commit ? commit.slice(0, 12) : 'unknown');
  const emailConfig = getEmailConfig();
  const brevoKey = String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim();
  const brevoConfigured = Boolean(
    brevoKey
  );
  const brevoApiKeyLooksLikeSmtp = brevoKey.toLowerCase().startsWith('xsmtpsib-');
  const resendConfigured = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  console.log('Email transport status:', {
    configured: isEmailConfigured(),
    brevoConfigured,
    brevoApiKeyLooksLikeSmtp,
    resendConfigured,
    deliveryConfigured: isEmailConfigured() || brevoConfigured || resendConfigured,
    host: emailConfig.host || '',
    service: emailConfig.service || '',
    port: emailConfig.port,
    secure: emailConfig.secure,
    connectionTimeout: emailConfig.connectionTimeout,
    greetingTimeout: emailConfig.greetingTimeout,
    socketTimeout: emailConfig.socketTimeout,
    user: maskEmail(emailConfig.user),
    from: emailConfig.from
  });
  if (brevoApiKeyLooksLikeSmtp) {
    console.warn(
      'EMAIL_DELIVERY_PROVIDER=brevo expects a Brevo API key (xkeysib-...). Current BREVO_API_KEY looks like SMTP key (xsmtpsib-...).'
    );
  }
});

// Monthly invoice count reset (runs daily)
const scheduleInvoiceReset = () => {
  const runReset = async () => {
    try {
      await resetMonthlyInvoiceCounts();
    } catch (error) {
      console.error('Failed to reset invoice counts:', error?.message || error);
    }
  };

  runReset();
  setInterval(runReset, 24 * 60 * 60 * 1000);
};

scheduleInvoiceReset();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const scheduleRecurringInvoiceGeneration = () => {
  const enabled = String(process.env.RECURRING_INVOICE_AUTORUN || 'true')
    .trim()
    .toLowerCase() !== 'false';

  if (!enabled) {
    console.log('Recurring invoice generation is disabled (RECURRING_INVOICE_AUTORUN=false).');
    return;
  }

  const intervalMs = parsePositiveInt(
    process.env.RECURRING_INVOICE_INTERVAL_MS,
    5 * 60 * 1000
  );
  const initialDelayMs = parsePositiveInt(
    process.env.RECURRING_INVOICE_INITIAL_DELAY_MS,
    20 * 1000
  );

  let isRunning = false;

  const runRecurringGeneration = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const summary = await processDueRecurringInvoices();
      if (
        summary.generatedInvoices > 0
        || summary.failedTemplates > 0
        || summary.blockedTemplates > 0
      ) {
        console.log('Recurring invoice run summary:', summary);
      }
    } catch (error) {
      console.error('Recurring invoice generation failed:', error?.message || error);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runRecurringGeneration, initialDelayMs);
  setInterval(runRecurringGeneration, intervalMs);
};

scheduleRecurringInvoiceGeneration();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
