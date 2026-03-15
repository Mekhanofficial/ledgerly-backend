const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const TaxSettings = require('../models/TaxSettings');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');

describe('Tax Settings Routes', () => {
  const app = createTestApp();

  it('stores tax settings per business and does not leak updates across businesses', async () => {
    const accountA = await createUserWithBusiness({ role: 'admin' });
    const accountB = await createUserWithBusiness({ role: 'admin' });

    const updateA = await request(app)
      .put('/api/v1/tax-settings')
      .set(authHeader(accountA.token))
      .send({
        taxEnabled: true,
        taxName: 'VAT-A',
        taxRate: 12,
        allowManualOverride: true
      });

    expect(updateA.statusCode).toBe(200);
    expect(updateA.body.success).toBe(true);
    expect(updateA.body.data.taxName).toBe('VAT-A');
    expect(Number(updateA.body.data.taxRate)).toBe(12);

    const updateAFromBusinessEndpoint = await request(app)
      .put('/api/v1/business/tax-settings')
      .set(authHeader(accountA.token))
      .send({
        taxEnabled: true,
        taxName: 'VAT-A-ALT',
        taxRate: 14.5,
        allowManualOverride: true
      });

    expect(updateAFromBusinessEndpoint.statusCode).toBe(200);
    expect(updateAFromBusinessEndpoint.body.success).toBe(true);
    expect(updateAFromBusinessEndpoint.body.data.taxName).toBe('VAT-A-ALT');
    expect(Number(updateAFromBusinessEndpoint.body.data.taxRate)).toBe(14.5);

    const updateB = await request(app)
      .put('/api/v1/tax-settings')
      .set(authHeader(accountB.token))
      .send({
        taxEnabled: true,
        taxName: 'GST-B',
        taxRate: 5,
        allowManualOverride: false
      });

    expect(updateB.statusCode).toBe(200);
    expect(updateB.body.success).toBe(true);
    expect(updateB.body.data.taxName).toBe('GST-B');
    expect(Number(updateB.body.data.taxRate)).toBe(5);
    expect(updateB.body.data.allowManualOverride).toBe(false);

    const getA = await request(app)
      .get('/api/v1/tax-settings')
      .set(authHeader(accountA.token));
    const getB = await request(app)
      .get('/api/v1/tax-settings')
      .set(authHeader(accountB.token));

    expect(getA.statusCode).toBe(200);
    expect(getB.statusCode).toBe(200);
    expect(getA.body.data.taxName).toBe('VAT-A-ALT');
    expect(Number(getA.body.data.taxRate)).toBe(14.5);
    expect(getA.body.data.allowManualOverride).toBe(true);
    expect(getB.body.data.taxName).toBe('GST-B');
    expect(Number(getB.body.data.taxRate)).toBe(5);
    expect(getB.body.data.allowManualOverride).toBe(false);

    const scopedSettings = await TaxSettings.find({
      business: { $in: [accountA.business._id, accountB.business._id] }
    }).lean();

    expect(scopedSettings).toHaveLength(2);
  });
});
