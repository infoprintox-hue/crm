const origin = String(process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const environment = {
  mongodb: Boolean(process.env.MONGODB_URI || process.env.MONGO_URI),
  databaseName: Boolean(process.env.MONGODB_DB || process.env.MONGO_DB),
  sessionSecret: Boolean(process.env.SESSION_SECRET),
  adminBootstrapPassword: Boolean(process.env.ADMIN_PASSWORD),
  cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
};

console.log('Environment:', environment);

try {
  const response = await fetch(`${origin}/api/health`, { cache: 'no-store' });
  const health = await response.json();
  console.log('Frontend:', health.frontend);
  console.log('Backend:', health.backend);
  console.log('Database:', health.database);
  console.log('Overall:', health.ok ? 'connected' : 'needs attention');
  process.exitCode = health.ok ? 0 : 1;
} catch (error) {
  console.error('Connection check failed:', error.message);
  console.error(`Confirm the app is running at ${origin}.`);
  process.exitCode = 1;
}
