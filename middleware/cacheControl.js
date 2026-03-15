const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PUBLIC_CACHE_MAX_AGE = parsePositiveInt(
  process.env.API_PUBLIC_CACHE_MAX_AGE_SECONDS,
  3600
);

// Keep an explicit allowlist for endpoints that are safe to cache publicly.
const PUBLIC_PATTERNS = [
  /^\/invoices\/public(\/|$)/,
  /^\/payments\/verify\/?$/,
  /^\/payments\/callback\/?$/,
  /^\/livechat\/eligibility\/?$/
];

const apiCacheControl = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const requestPath = String(req.path || '/');
  if (PUBLIC_PATTERNS.some((pattern) => pattern.test(requestPath))) {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${PUBLIC_CACHE_MAX_AGE}, stale-while-revalidate=60`
    );
    return next();
  }

  // Default all private API reads to no-store so post-mutation UIs never see stale lists.
  res.setHeader('Cache-Control', 'no-store');
  return next();
};

module.exports = { apiCacheControl };
