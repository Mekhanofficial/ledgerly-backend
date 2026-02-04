const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS
const allowedOrigins = [
  'http://localhost:7000',
  'http://localhost:19006',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:5174'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet());
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
  express.static('uploads', {
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

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'InvoiceFlow API is running',
    timestamp: new Date().toISOString()
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

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
