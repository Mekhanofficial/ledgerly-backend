const request = require('supertest');
const User = require('../models/User');

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

  it('applies updated role templates to existing users immediately', async () => {
    const { business, token: adminToken } = await createUserWithBusiness(
      buildProfessionalAccount('admin', getDefaultPermissions('admin'))
    );

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const accountantPermissions = getDefaultPermissions('accountant');
    accountantPermissions.customers.create = true;
    accountantPermissions.customers.update = true;

    const accountant = await User.create({
      name: `Accountant ${suffix}`,
      email: `accountant_${suffix}@example.com`,
      password: 'password123',
      phone: '08022222222',
      business: business._id,
      role: 'accountant',
      permissions: accountantPermissions,
      emailVerified: true,
      isActive: true
    });

    const accountantToken = accountant.getSignedJwtToken();

    const initialCreateResponse = await request(app)
      .post('/api/v1/customers')
      .set(authHeader(accountantToken))
      .send({
        name: `Customer Initial ${suffix}`,
        email: `customer_initial_${suffix}@example.com`
      });

    expect(initialCreateResponse.statusCode).toBe(201);

    const updateTemplateResponse = await request(app)
      .put('/api/v1/settings')
      .set(authHeader(adminToken))
      .send({
        rolePermissions: {
          accountant: {
            customers: {
              create: false,
              update: false
            }
          }
        }
      });

    expect(updateTemplateResponse.statusCode).toBe(200);

    const blockedCreateResponse = await request(app)
      .post('/api/v1/customers')
      .set(authHeader(accountantToken))
      .send({
        name: `Customer Blocked ${suffix}`,
        email: `customer_blocked_${suffix}@example.com`
      });

    expect(blockedCreateResponse.statusCode).toBe(403);
    expect(blockedCreateResponse.body.error).toBe('Missing permission: customers.create');

    const reloadedAccountant = await User.findById(accountant._id).select('permissions');
    expect(reloadedAccountant.permissions.customers.create).toBe(false);
    expect(reloadedAccountant.permissions.customers.update).toBe(false);
  });
});
