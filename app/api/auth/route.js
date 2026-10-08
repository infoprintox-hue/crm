import { bodyOf, json } from '@/lib/server/http';
import { clearSessionCookie, createSession, hashPin, readSession, sessionCookie, setAdminPassword, bumpSessions, verifyAdminPassword } from '@/lib/server/auth';
import { friendlyError, logActivity, readState } from '@/lib/server/db';
import { cleanState, memberRole, publicMember } from '@/lib/server/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('members') === '1') {
      const record = await readState();
      const state = cleanState(record.payload);
      return json({ members: state.team.filter(member => member.active !== false).map(member => ({ ...publicMember(member), accessRole: memberRole(member) })) });
    }
    if (url.searchParams.get('me') === '1') {
      const user = await readSession(request);
      return user ? json({ authenticated: true, user }) : json({ authenticated: false }, 401);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await bodyOf(request);
    if (body.action === 'logout') {
      const user = await readSession(request);
      if (user) await logActivity('logout', user.name, { role: user.role });
      return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
    }

    if (body.action === 'changePassword') {
      const user = await readSession(request);
      if (user?.role !== 'admin') return json({ error: 'Only Admin can change the password' }, 403);
      if (!await verifyAdminPassword(body.currentPassword)) return json({ error: 'Current password is incorrect' }, 401);
      await setAdminPassword(body.newPassword, user.name, true);
      const token = await createSession({ role: 'admin', name: user.name });
      await logActivity('password_changed', user.name, {});
      return json({ ok: true, user }, 200, { 'set-cookie': sessionCookie(token) });
    }

    if (body.action === 'massLogout') {
      const user = await readSession(request);
      if (user?.role !== 'admin') return json({ error: 'Only Admin can sign everyone out' }, 403);
      await bumpSessions(user.name);
      const token = await createSession({ role: 'admin', name: user.name });
      await logActivity('sessions_revoked', user.name, { role: user.role });
      return json({ ok: true, user }, 200, { 'set-cookie': sessionCookie(token) });
    }

    if (body.role === 'admin' && !body.memberId) {
      if (!await verifyAdminPassword(String(body.password || ''))) return json({ error: 'Invalid admin password' }, 401);
      const user = { role: 'admin', name: 'Admin' };
      const token = await createSession(user);
      await logActivity('login', user.name, { role: user.role });
      return json({ ok: true, user }, 200, { 'set-cookie': sessionCookie(token) });
    }

    if (body.memberId && ['admin', 'subadmin', 'sales', 'teamlead', 'team'].includes(body.role)) {
      const record = await readState();
      const member = cleanState(record.payload).team.find(item => item.id === body.memberId && item.active !== false);
      if (!member) return json({ error: 'Team member not found' }, 404);
      if (!member.pinHash) return json({ error: 'Admin has not set a login PIN for this member' }, 403);
      if (member.pinHash !== hashPin(body.pin)) return json({ error: 'Invalid login PIN' }, 401);
      const role = memberRole(member);
      if (role !== body.role) return json({ error: `Choose the ${role} login for this member` }, 403);
      const user = { role, memberId: member.id, name: member.name };
      const token = await createSession(user);
      await logActivity('login', user.name, { role, memberId: member.id });
      return json({ ok: true, user }, 200, { 'set-cookie': sessionCookie(token) });
    }

    return json({ error: 'Choose a valid login role' }, 400);
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
