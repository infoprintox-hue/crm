import { database } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { publicEnvironmentStatus, serverLog } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const environment = publicEnvironmentStatus();
  let databaseConnected = false;
  let databaseError = '';

  try {
    const { db } = await database();
    await db.command({ ping: 1 });
    databaseConnected = true;
  } catch (error) {
    databaseError = error?.message || 'Database connection failed';
  }

  const backendReady = environment.mongodb && environment.sessionSecret;
  const ok = backendReady && databaseConnected;
  const detail = {
    ok,
    frontend: 'connected',
    backend: backendReady ? 'connected' : 'configuration-missing',
    database: databaseConnected ? 'connected' : 'disconnected',
    environment,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };

  serverLog(ok ? 'info' : 'warn', 'health.check', {
    ...detail,
    databaseError,
  });

  return json(detail, ok ? 200 : 503);
}
