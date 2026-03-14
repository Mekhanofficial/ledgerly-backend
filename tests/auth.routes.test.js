const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const Business = require('../models/Business');
const User = require('../models/User');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');

describe('Auth Routes', () => {
  const app = createTestApp();

  it('registers a new user and writes user + business records', async () => {
    const emailSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      name: 'QA Register User',
      email: `register_${emailSuffix}@example.com`,
      password: 'password123',
      phone: '08010000000',
      businessName: `Register Biz ${emailSuffix}`,
      currencyCode: 'USD',
      country: 'United States'
    };

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe(payload.email.toLowerCase());

    const createdUser = await User.findOne({ email: payload.email.toLowerCase() });
    const createdBusiness = await Business.findOne({ email: payload.email.toLowerCase() });

    expect(createdUser).toBeTruthy();
    expect(createdBusiness).toBeTruthy();
    expect(String(createdUser.business)).toBe(String(createdBusiness._id));
  });

  it('rejects login with missing password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing-password@example.com' });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/please provide an email and password/i);
  });

  it('logs in verified user and returns token + user payload', async () => {
    const { user } = await createUserWithBusiness({
      role: 'admin',
      emailVerified: true,
      userOverrides: {
        email: `login_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
        password: 'securepass123'
      }
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: 'securepass123'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(user.email);
  });

  it('returns current user profile for authenticated token', async () => {
    const { user, token } = await createUserWithBusiness({ role: 'admin' });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(token));

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe(user.email);
    expect(response.body.data.avatarUrl).toBeTruthy();
  });
});
