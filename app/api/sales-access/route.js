import { readSession } from '@/lib/server/auth';
import { friendlyError, logActivity, readState, revealedLeadIdsToday } from '@/lib/server/db';
import { bodyOf, json } from '@/lib/server/http';
import { canAccessLead, cleanState, salesMember } from '@/lib/server/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['reveal', 'copy', 'call', 'whatsapp']);

function indiaDayStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+05:30`).toISOString();
}

export async function POST(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  if (user.role !== 'sales') return json({ error: 'Sales login required' }, 403);

  try {
    const body = await bodyOf(request);
    const action = String(body.action || 'reveal').toLowerCase();
    const leadId = String(body.leadId || '');
    if (!ACTIONS.has(action) || !leadId) return json({ error: 'Invalid phone access request' }, 400);

    const record = await readState();
    const state = cleanState(record.payload);
    const member = salesMember(state, user);
    if (!member || !canAccessLead(state, user, leadId)) return json({ error: 'This lead is not assigned to you' }, 403);

    const lead = state.leads.find(item => String(item.id) === leadId);
    if (!lead || !String(lead.phone || '').trim()) return json({ error: 'Phone number is not available' }, 404);

    const revealed = (await revealedLeadIdsToday(user.memberId, indiaDayStart())).map(String);
    const alreadyRevealed = revealed.includes(leadId);
    const limit = Math.min(200, Math.max(1, Number(member.phoneRevealLimit || 25)));
    if (!alreadyRevealed && revealed.length >= limit) return json({ error: `Daily number limit reached (${limit}). Ask Admin for access.` }, 429);

    await logActivity(`lead_phone_${action}`, user.name, {
      role: user.role,
      memberId: user.memberId,
      leadId,
      leadName: String(lead.name || lead.company || 'Lead').slice(0, 120),
      phoneLast4: String(lead.phone).replace(/\D/g, '').slice(-4),
    });

    const used = revealed.length + (alreadyRevealed ? 0 : 1);
    return json({ ok: true, leadId, phone: String(lead.phone), remaining: Math.max(0, limit - used), limit });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
