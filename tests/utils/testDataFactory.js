const Business = require('../../models/Business');
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const { getDefaultPermissions } = require('../../utils/rolePermissions');

const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createBusiness = async (overrides = {}) => {
  const suffix = uniqueSuffix();
  return Business.create({
    name: `Ledgerly QA ${suffix}`,
    email: `business_${suffix}@example.com`,
    phone: '08000000000',
    owner: null,
    ...overrides
  });
};

const createUserWithBusiness = async (options = {}) => {
  const {
    role = 'super_admin',
    emailVerified = true,
    businessOverrides = {},
    userOverrides = {}
  } = options;

  const suffix = uniqueSuffix();
  const business = await createBusiness(businessOverrides);
  const user = await User.create({
    name: `QA User ${suffix}`,
    email: `qa_user_${suffix}@example.com`,
    password: 'password123',
    phone: '08011111111',
    business: business._id,
    role,
    permissions: getDefaultPermissions(role),
    emailVerified,
    isActive: true,
    ...userOverrides
  });

  business.owner = user._id;
  await business.save();

  return {
    user,
    business,
    token: user.getSignedJwtToken()
  };
};

const createCustomerForBusiness = async ({ businessId, userId, overrides = {} }) => {
  const suffix = uniqueSuffix();
  return Customer.create({
    business: businessId,
    createdBy: userId,
    name: `QA Customer ${suffix}`,
    email: `qa_customer_${suffix}@example.com`,
    phone: `081${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`,
    ...overrides
  });
};

const createInvoicePayload = ({ customerId, dueInDays = 14, overrides = {} }) => {
  const suffix = uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
  return {
    invoiceNumber: `INV-QA-${suffix}`,
    customer: String(customerId),
    dueDate: dueDate.toISOString(),
    paymentTerms: 'net-14',
    notes: 'Automated QA invoice',
    terms: 'Payment due within 14 days',
    templateStyle: 'standard',
    items: [
      {
        description: 'QA Testing Service',
        quantity: 2,
        unitPrice: 50,
        taxRate: 0
      }
    ],
    ...overrides
  };
};

const getMinimalPdfAttachment = (fileName = 'invoice-qa.pdf') => {
  const rawPdf = '%PDF-1.1\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF';
  return {
    encoding: 'base64',
    fileName,
    data: Buffer.from(rawPdf, 'utf8').toString('base64')
  };
};

const authHeader = (token) => ({
  Authorization: `Bearer ${token}`
});

module.exports = {
  createUserWithBusiness,
  createCustomerForBusiness,
  createInvoicePayload,
  getMinimalPdfAttachment,
  authHeader
};
