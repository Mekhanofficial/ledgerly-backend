const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PRIVATE_CACHE_MAX_AGE = parsePositiveInt(
  process.env.API_PRIVATE_CACHE_MAX_AGE_SECONDS,
  300
);

const PUBLIC_CACHE_MAX_AGE = parsePositiveInt(
  process.env.API_PUBLIC_CACHE_MAX_AGE_SECONDS,
  3600
);

const NO_STORE_PATTERNS = [
  /^\/auth(\/|$)/,
  /^\/webhooks(\/|$)/,
  /^\/payments\/webhook(\/|$)/,
  // Dynamic inventory data should always be fresh.
  /^\/categories(\/|$)/,
  /^\/products(\/|$)/,
  /^\/suppliers(\/|$)/
];

const PUBLIC_PATTERNS = [
  /^\/invoices\/public(\/|$)/,
  /^\/payments\/verify(\/|$)/,
  /^\/payments\/callback(\/|$)/,
  /^\/livechat\/eligibility(\/|$)/
];

const apiCacheControl = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const requestPath = String(req.path || '/');
  if (NO_STORE_PATTERNS.some((pattern) => pattern.test(requestPath))) {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }

  if (PUBLIC_PATTERNS.some((pattern) => pattern.test(requestPath))) {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${PUBLIC_CACHE_MAX_AGE}, stale-while-revalidate=60`
    );
    return next();
  }

  res.setHeader(
    'Cache-Control',
    `private, max-age=${PRIVATE_CACHE_MAX_AGE}, must-revalidate`
  );
  return next();
};

module.exports = { apiCacheControl };
