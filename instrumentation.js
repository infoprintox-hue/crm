export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { publicEnvironmentStatus, serverLog } = await import('./lib/server/logger.js');
  const environment = publicEnvironmentStatus();
  const requiredReady = environment.mongodb && environment.sessionSecret;
  serverLog(requiredReady ? 'info' : 'warn', 'server.startup', {
    runtime: process.env.NEXT_RUNTIME,
    nodeEnvironment: process.env.NODE_ENV,
    environment,
    message: requiredReady ? 'Backend environment is configured.' : 'Backend environment is incomplete. Check .env.local.',
  });

  if (!environment.mongodb) {
    serverLog('error', 'startup.mongodb_missing', { message: 'MongoDB URI missing. Create .env.local and add MONGODB_URI.' });
    return;
  }

  try {
    const { database } = await import('./lib/server/db.js');
    const { db } = await database();
    await db.command({ ping: 1 });
    serverLog('info', 'startup.mongodb_ready', { database: db.databaseName, message: 'MongoDB connection verified. Server is ready.' });
  } catch (error) {
    serverLog('error', 'startup.mongodb_failed', { error, message: 'MongoDB could not be reached during server startup.' });
  }
}
