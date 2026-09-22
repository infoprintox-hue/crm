const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /(password|secret|token|authorization|cookie|pin|mongodb.*uri|mongo.*uri|api.*key)/i;

function configuredLevel() {
  const value = String(process.env.VL_LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
  return LEVELS[value] ? value : 'info';
}

function sanitize(value, key = '', depth = 0) {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (depth > 4) return '[TRUNCATED]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      stack: process.env.NODE_ENV === 'development' ? value.stack : undefined,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitize(item, key, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export function serverLog(level, event, details = {}) {
  const normalized = LEVELS[level] ? level : 'info';
  if (LEVELS[normalized] < LEVELS[configuredLevel()]) return;
  const safeDetails = sanitize(details);
  const entry = {
    timestamp: new Date().toISOString(),
    level: normalized,
    service: 'visitinglink-backend',
    event,
    ...safeDetails,
  };
  const writer = normalized === 'error' ? console.error : normalized === 'warn' ? console.warn : console.log;
  if (String(process.env.VL_LOG_FORMAT || 'pretty').toLowerCase() === 'json') {
    writer(JSON.stringify(entry));
    return;
  }
  const { message, ...context } = safeDetails;
  const suffix = message ? ` — ${message}` : '';
  const hasContext = Object.keys(context).length > 0;
  writer(`${entry.timestamp} [Visitinglink] ${normalized.toUpperCase()} ${event}${suffix}`, ...(hasContext ? [context] : []));
}

export function publicEnvironmentStatus() {
  return {
    mongodb: Boolean(process.env.MONGODB_URI || process.env.MONGO_URI),
    databaseName: Boolean(process.env.MONGODB_DB || process.env.MONGO_DB),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    adminBootstrapPassword: Boolean(process.env.ADMIN_PASSWORD),
    cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  };
}
