const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../utils/email', () => jest.fn(async () => ({
  accepted: ['qa@example.com'],
  rejected: [],
  messageId: 'mocked-email-id'
})));

jest.mock('../../emailmicroservice', () => ({
  OTP_EXPIRY_MINUTES: 10,
  sendVerificationOtpEmail: jest.fn(async () => ({ queued: true }))
}));

let mongoServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'ledgerly-test-secret';
  process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1h';
  process.env.JWT_COOKIE_EXPIRE = process.env.JWT_COOKIE_EXPIRE || '1';
  process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  process.env.BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:7000';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {
    dbName: 'ledgerly-api-tests'
  });
});

afterEach(async () => {
  const collections = mongoose.connection.collections || {};
  const deletions = Object.values(collections).map((collection) => collection.deleteMany({}));
  await Promise.all(deletions);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
