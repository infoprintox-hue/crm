import { readSession } from '@/lib/server/auth';
import { friendlyError, listActivity, logActivity } from '@/lib/server/db';
import { bodyOf, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  if (!['admin', 'teamlead'].includes(user.role)) return json({ error: 'Admin or Manager access required' }, 403);
  try {
    return json({ activity: await listActivity(new URL(request.url).searchParams.get('limit')) });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}

export async function POST(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  try {
    const body = await bodyOf(request);
    if (!['app_open', 'page_view', 'heartbeat'].includes(body.action)) return json({ error: 'Unsupported activity' }, 400);
    await logActivity(body.action, user.name, { role: user.role, memberId: user.memberId || '', page: String(body.page || '').slice(0, 50) });
    return json({ ok: true });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
