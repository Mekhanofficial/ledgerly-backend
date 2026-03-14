const request = require('supertest');

jest.mock('../utils/assetStorage', () => {
  const actual = jest.requireActual('../utils/assetStorage');
  return {
    ...actual,
    uploadCloudinaryImage: jest.fn(async () => ({
      url: 'https://cdn.example.com/ledgerly/logo-test.png',
      publicId: 'ledgerly/logos/logo-test'
    })),
    removeStoredAsset: jest.fn(async () => {})
  };
});

const createTestApp = require('./utils/createTestApp');
const Business = require('../models/Business');
const { authHeader, createUserWithBusiness } = require('./utils/testDataFactory');
const { uploadCloudinaryImage } = require('../utils/assetStorage');

describe('Business Routes', () => {
  const app = createTestApp();

  beforeEach(() => {
    uploadCloudinaryImage.mockClear();
  });

  it('accepts common image uploads for business logo and persists URL', async () => {
    const { business, token } = await createUserWithBusiness({
      role: 'admin',
      businessOverrides: {
        subscription: {
          plan: 'enterprise',
          status: 'active',
          billingCycle: 'monthly'
        }
      },
      userOverrides: {
        plan: 'enterprise',
        subscriptionStatus: 'active'
      }
    });

    const response = await request(app)
      .put('/api/v1/business')
      .set(authHeader(token))
      .field('name', 'Updated QA Business')
      .attach('logo', Buffer.from('fake-image-data'), {
        filename: 'brand-logo.png',
        contentType: 'image/png'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.logo).toBe('https://cdn.example.com/ledgerly/logo-test.png');
    expect(uploadCloudinaryImage).toHaveBeenCalledTimes(1);

    const persistedBusiness = await Business.findById(business._id).lean();
    expect(persistedBusiness.logo).toBe('https://cdn.example.com/ledgerly/logo-test.png');
  });

  it('rejects non-image files for logo upload', async () => {
    const { token } = await createUserWithBusiness({
      role: 'admin',
      businessOverrides: {
        subscription: {
          plan: 'enterprise',
          status: 'active',
          billingCycle: 'monthly'
        }
      },
      userOverrides: {
        plan: 'enterprise',
        subscriptionStatus: 'active'
      }
    });

    const response = await request(app)
      .put('/api/v1/business')
      .set(authHeader(token))
      .attach('logo', Buffer.from('not-an-image'), {
        filename: 'logo.txt',
        contentType: 'text/plain'
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/logo uploads must be/i);
    expect(uploadCloudinaryImage).not.toHaveBeenCalled();
  });
});

