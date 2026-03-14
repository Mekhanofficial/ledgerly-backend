const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');

describe('Error Responses', () => {
  const app = createTestApp();

  it('returns 404 for unknown routes', async () => {
    const response = await request(app).get('/api/v1/unknown-route');

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/route not found/i);
  });

  it('returns 404 for invalid invoice id lookup', async () => {
    const { token } = await createUserWithBusiness({ role: 'super_admin' });

    const response = await request(app)
      .get('/api/v1/invoices/67badbadbadbadbadbadbad')
      .set(authHeader(token));

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/invoice not found|resource not found/i);
  });

  it('returns 401 for protected route without auth header', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/not authorized/i);
  });
});
