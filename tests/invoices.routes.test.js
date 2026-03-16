const request = require('supertest');

const createTestApp = require('./utils/createTestApp');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const sendEmail = require('../utils/email');
const {
  authHeader,
  createCustomerForBusiness,
  createInvoicePayload,
  createUserWithBusiness,
  getMinimalPdfAttachment
} = require('./utils/testDataFactory');

describe('Invoice Routes', () => {
  const app = createTestApp();

  it('creates, reads, updates, sends, gets PDF, and deletes an invoice', async () => {
    const { user, business, token } = await createUserWithBusiness({ role: 'super_admin' });
    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const createResponse = await request(app)
      .post('/api/v1/invoices')
      .set(authHeader(token))
      .send(createInvoicePayload({ customerId: customer._id }));

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data._id).toBeTruthy();

    const invoiceId = createResponse.body.data._id;

    const readResponse = await request(app)
      .get(`/api/v1/invoices/${invoiceId}`)
      .set(authHeader(token));

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.body.success).toBe(true);
    expect(readResponse.body.data._id).toBe(invoiceId);

    const updateResponse = await request(app)
      .put(`/api/v1/invoices/${invoiceId}`)
      .set(authHeader(token))
      .send({
        notes: 'Updated by automated test'
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data.notes).toBe('Updated by automated test');

    const sendResponse = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set(authHeader(token))
      .send({
        customerEmail: customer.email,
        pdfAttachment: getMinimalPdfAttachment()
      });

    expect(sendResponse.statusCode).toBe(200);
    expect(sendResponse.body.success).toBe(true);
    expect(sendResponse.body.data.status).toBe('sent');

    const pdfResponse = await request(app)
      .get(`/api/v1/invoices/${invoiceId}/pdf`)
      .set(authHeader(token));

    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect(pdfResponse.body.length).toBeGreaterThan(0);

    const deleteResponse = await request(app)
      .delete(`/api/v1/invoices/${invoiceId}`)
      .set(authHeader(token));

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    const deletedInvoice = await Invoice.findById(invoiceId);
    expect(deletedInvoice).toBeNull();
  });

  it('sends invoice email even when frontend pdfAttachment is missing', async () => {
    sendEmail.mockClear();
    const { user, business, token } = await createUserWithBusiness({ role: 'super_admin' });
    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const createResponse = await request(app)
      .post('/api/v1/invoices')
      .set(authHeader(token))
      .send(createInvoicePayload({ customerId: customer._id }));

    expect(createResponse.statusCode).toBe(201);
    const invoiceId = createResponse.body.data._id;

    const sendResponse = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set(authHeader(token))
      .send({
        customerEmail: customer.email
      });

    expect(sendResponse.statusCode).toBe(200);
    expect(sendResponse.body.success).toBe(true);
    expect(sendResponse.body.data.status).toBe('sent');
    expect(sendEmail).toHaveBeenCalled();

    const emailPayload = sendEmail.mock.calls.at(-1)?.[0];
    expect(emailPayload?.html).toContain(`/invoice/pay/${sendResponse.body.data.publicSlug}`);
    expect(emailPayload?.html).not.toContain(`/api/v1/invoices/public/${sendResponse.body.data.publicSlug}/pay`);
  });

  it('writes derived records when invoice is created (customer stats + user invoice count)', async () => {
    const { user, business, token } = await createUserWithBusiness({ role: 'super_admin' });
    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const response = await request(app)
      .post('/api/v1/invoices')
      .set(authHeader(token))
      .send(createInvoicePayload({ customerId: customer._id }));

    expect(response.statusCode).toBe(201);

    const refreshedUser = await User.findById(user._id).lean();
    const refreshedCustomer = await Customer.findById(customer._id).lean();

    expect(refreshedUser.invoiceCountThisMonth).toBe(1);
    expect(Number(refreshedCustomer.totalInvoiced)).toBeGreaterThan(0);
    expect(Number(refreshedCustomer.outstandingBalance)).toBeGreaterThan(0);
  });

  it('rejects invoice creation without authentication', async () => {
    const { user, business } = await createUserWithBusiness({ role: 'super_admin' });
    const customer = await createCustomerForBusiness({
      businessId: business._id,
      userId: user._id
    });

    const response = await request(app)
      .post('/api/v1/invoices')
      .send(createInvoicePayload({ customerId: customer._id }));

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
