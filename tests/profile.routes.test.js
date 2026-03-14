const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const User = require('../models/User');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');

describe('User Profile Routes', () => {
  const app = createTestApp();

  it('updates profile details and persists to database', async () => {
    const { user, token } = await createUserWithBusiness({ role: 'admin' });
    const nextName = 'Updated QA Name';
    const nextPhone = '08022222222';

    const response = await request(app)
      .put('/api/v1/auth/updatedetails')
      .set(authHeader(token))
      .send({
        name: nextName,
        phone: nextPhone
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe(nextName);
    expect(response.body.data.phone).toBe(nextPhone);

    const persisted = await User.findById(user._id);
    expect(persisted.name).toBe(nextName);
    expect(persisted.phone).toBe(nextPhone);
  });

  it('rejects profile update without auth token', async () => {
    const response = await request(app)
      .put('/api/v1/auth/updatedetails')
      .send({ name: 'Should Fail' });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/not authorized/i);
  });

  it('rejects empty profile update payload', async () => {
    const { token } = await createUserWithBusiness({ role: 'admin' });

    const response = await request(app)
      .put('/api/v1/auth/updatedetails')
      .set(authHeader(token))
      .send({});

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/no updates provided/i);
  });
});
