const request = require('supertest');

const Receipt = require('../models/Receipt');
const createTestApp = require('./utils/createTestApp');
const {
  authHeader,
  createCustomerForBusiness,
  createUserWithBusiness
} = require('./utils/testDataFactory');

describe('Receipt Routes', () => {
  const app = createTestApp();

  it('emails receipt even when frontend pdfAttachment is missing', async () => {
    const { user, business, token } = await createUserWithBusiness({ role: 'super_admin' });
    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const receipt = await Receipt.create({
      business: business._id,
      receiptNumber: `RCT-QA-${Date.now()}`,
      customer: customer._id,
      items: [
        {
          description: 'QA Receipt Item',
          quantity: 1,
          unitPrice: 100,
          total: 100
        }
      ],
      subtotal: 100,
      tax: {
        amount: 0,
        percentage: 0
      },
      total: 100,
      amountPaid: 100,
      paymentMethod: 'cash',
      createdBy: user._id
    });

    const response = await request(app)
      .post(`/api/v1/receipts/${receipt._id}/email`)
      .set(authHeader(token))
      .send({
        customerEmail: customer.email
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Receipt emailed successfully');
  });
});
