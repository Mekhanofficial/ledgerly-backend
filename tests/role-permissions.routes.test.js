const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const {
  authHeader,
  createCustomerForBusiness,
  createInvoicePayload,
  createUserWithBusiness
} = require('./utils/testDataFactory');
const { getDefaultPermissions } = require('../utils/rolePermissions');

const buildProfessionalAccount = (role, permissions) => ({
  role,
  businessOverrides: {
    subscription: {
      plan: 'professional',
      status: 'active',
      billingCycle: 'monthly'
    }
  },
  userOverrides: {
    plan: 'professional',
    subscriptionStatus: 'active',
    permissions
  }
});

describe('Role Permission Route Enforcement', () => {
  const app = createTestApp();

  it('allows a normally restricted role when the saved permissions grant access', async () => {
    const viewerPermissions = getDefaultPermissions('viewer');
    viewerPermissions.invoices.create = true;
    viewerPermissions.customers.create = true;
    viewerPermissions.customers.update = true;
    viewerPermissions.products.read = true;
    viewerPermissions.settings.view = true;

    const { user, business, token } = await createUserWithBusiness(
      buildProfessionalAccount('viewer', viewerPermissions)
    );

    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const invoiceResponse = await request(app)
      .post('/api/v1/invoices')
      .set(authHeader(token))
      .send(createInvoicePayload({ customerId: customer._id }));

    const productsResponse = await request(app)
      .get('/api/v1/products')
      .set(authHeader(token));

    const settingsResponse = await request(app)
      .get('/api/v1/settings')
      .set(authHeader(token));

    expect(invoiceResponse.statusCode).toBe(201);
    expect(invoiceResponse.body.success).toBe(true);
    expect(productsResponse.statusCode).toBe(200);
    expect(settingsResponse.statusCode).toBe(200);
  });

  it('blocks routes when the saved permissions revoke access, even for normally allowed roles', async () => {
    const staffPermissions = getDefaultPermissions('staff');
    staffPermissions.invoices.read = false;
    staffPermissions.products.read = false;
    staffPermissions.reports.view = false;
    staffPermissions.settings.view = true;
    staffPermissions.settings.update = false;

    const { token } = await createUserWithBusiness(
      buildProfessionalAccount('staff', staffPermissions)
    );

    const invoicesResponse = await request(app)
      .get('/api/v1/invoices')
      .set(authHeader(token));

    const productsResponse = await request(app)
      .get('/api/v1/products')
      .set(authHeader(token));

    const reportsResponse = await request(app)
      .get('/api/v1/reports/dashboard')
      .set(authHeader(token));

    const settingsReadResponse = await request(app)
      .get('/api/v1/settings')
      .set(authHeader(token));

    const settingsWriteResponse = await request(app)
      .put('/api/v1/settings')
      .set(authHeader(token))
      .send({
        preferences: {
          currency: 'USD'
        }
      });

    expect(invoicesResponse.statusCode).toBe(403);
    expect(productsResponse.statusCode).toBe(403);
    expect(reportsResponse.statusCode).toBe(403);
    expect(settingsReadResponse.statusCode).toBe(200);
    expect(settingsWriteResponse.statusCode).toBe(403);
  });
});
