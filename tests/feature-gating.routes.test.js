const mongoose = require('mongoose');
const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');

const buildPlanOptions = (plan) => ({
  role: 'admin',
  businessOverrides: {
    subscription: {
      plan,
      status: 'active',
      billingCycle: 'monthly'
    }
  },
  userOverrides: {
    plan,
    subscriptionStatus: 'active'
  }
});

describe('Subscription Feature Gates', () => {
  const app = createTestApp();

  it('blocks inventory read endpoints on Starter and allows them on Professional', async () => {
    const starterUser = await createUserWithBusiness(buildPlanOptions('starter'));

    const starterProducts = await request(app)
      .get('/api/v1/products')
      .set(authHeader(starterUser.token));
    const starterCategories = await request(app)
      .get('/api/v1/categories')
      .set(authHeader(starterUser.token));
    const starterSuppliers = await request(app)
      .get('/api/v1/suppliers')
      .set(authHeader(starterUser.token));

    expect(starterProducts.statusCode).toBe(403);
    expect(starterCategories.statusCode).toBe(403);
    expect(starterSuppliers.statusCode).toBe(403);

    const professionalUser = await createUserWithBusiness(buildPlanOptions('professional'));

    const professionalProducts = await request(app)
      .get('/api/v1/products')
      .set(authHeader(professionalUser.token));
    const professionalCategories = await request(app)
      .get('/api/v1/categories')
      .set(authHeader(professionalUser.token));
    const professionalSuppliers = await request(app)
      .get('/api/v1/suppliers')
      .set(authHeader(professionalUser.token));

    expect(professionalProducts.statusCode).toBe(200);
    expect(professionalCategories.statusCode).toBe(200);
    expect(professionalSuppliers.statusCode).toBe(200);
  });

  it('blocks recurring endpoints on Starter and allows recurring list on Professional', async () => {
    const starterUser = await createUserWithBusiness(buildPlanOptions('starter'));
    const recurringInvoiceId = new mongoose.Types.ObjectId().toString();

    const starterList = await request(app)
      .get('/api/v1/invoices/recurring')
      .set(authHeader(starterUser.token));
    const starterPause = await request(app)
      .put(`/api/v1/invoices/recurring/${recurringInvoiceId}/pause`)
      .set(authHeader(starterUser.token));
    const starterResume = await request(app)
      .put(`/api/v1/invoices/recurring/${recurringInvoiceId}/resume`)
      .set(authHeader(starterUser.token));
    const starterGenerate = await request(app)
      .post(`/api/v1/invoices/recurring/${recurringInvoiceId}/generate`)
      .set(authHeader(starterUser.token));
    const starterCancel = await request(app)
      .put(`/api/v1/invoices/recurring/${recurringInvoiceId}/cancel`)
      .set(authHeader(starterUser.token));

    expect(starterList.statusCode).toBe(403);
    expect(starterPause.statusCode).toBe(403);
    expect(starterResume.statusCode).toBe(403);
    expect(starterGenerate.statusCode).toBe(403);
    expect(starterCancel.statusCode).toBe(403);

    const professionalUser = await createUserWithBusiness(buildPlanOptions('professional'));
    const professionalList = await request(app)
      .get('/api/v1/invoices/recurring')
      .set(authHeader(professionalUser.token));

    expect(professionalList.statusCode).toBe(200);
    expect(professionalList.body.success).toBe(true);
  });

  it('blocks team endpoints on Starter and allows team listing on Professional', async () => {
    const starterUser = await createUserWithBusiness(buildPlanOptions('starter'));
    const professionalUser = await createUserWithBusiness(buildPlanOptions('professional'));

    const starterTeamList = await request(app)
      .get('/api/v1/team')
      .set(authHeader(starterUser.token));
    const professionalTeamList = await request(app)
      .get('/api/v1/team')
      .set(authHeader(professionalUser.token));

    expect(starterTeamList.statusCode).toBe(403);
    expect(professionalTeamList.statusCode).toBe(200);
    expect(professionalTeamList.body.success).toBe(true);
  });
});
