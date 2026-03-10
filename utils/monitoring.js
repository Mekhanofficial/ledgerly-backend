const Sentry = require('@sentry/node');

let monitoringEnabled = false;

const initMonitoring = () => {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    monitoringEnabled = false;
    return { enabled: false };
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release:
      process.env.RENDER_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      process.env.COMMIT_SHA ||
      undefined,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1') || 0.1,
  });

  monitoringEnabled = true;
  return { enabled: true };
};

const captureException = (error, context = {}) => {
  if (!monitoringEnabled || !error) return;

  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      if (value === undefined) return;
      scope.setContext(key, value && typeof value === 'object' ? value : { value });
    });
    Sentry.captureException(error);
  });
};

module.exports = {
  initMonitoring,
  captureException,
  isMonitoringEnabled: () => monitoringEnabled,
};
