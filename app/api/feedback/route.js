import { randomBytes } from 'node:crypto';
import { readSession } from '@/lib/server/auth';
import { friendlyError, logActivity, mutateState, readState } from '@/lib/server/db';
import { bodyOf, json } from '@/lib/server/http';
import { cleanState } from '@/lib/server/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenOf = value => /^[a-f0-9]{64}$/i.test(String(value || '')) ? String(value) : '';

export async function GET(request) {
  try {
    const token = tokenOf(new URL(request.url).searchParams.get('token'));
    if (!token) return json({ error: 'Invalid feedback link' }, 400);
    const state = cleanState((await readState()).payload);
    const task = state.tasks.find(item => item.feedbackToken === token);
    if (!task) return json({ error: 'This feedback link is invalid or expired' }, 404);
    const member = state.team.find(item => item.id === task.assignee);
    return json({ ok: true, task: { taskName: task.name, project: task.client || 'Visitinglink project', workType: task.type || 'Service', completedAt: task.completedAt || null, deliveredBy: member?.name || 'Visitinglink Team', alreadySubmitted: Boolean(task.feedback?.submittedAt) } });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await bodyOf(request);
    const user = await readSession(request);
    if (['create', 'revoke'].includes(body.action)) {
      if (!user) return json({ error: 'Please login again' }, 401);
      if (!['admin', 'sales', 'teamlead'].includes(user.role)) return json({ error: 'Manager access required' }, 403);
    }
    const result = await mutateState(user?.name || 'Client Feedback', raw => {
      const state = cleanState(raw);
      if (body.action === 'create') {
        const task = state.tasks.find(item => item.id === body.taskId);
        if (!task) return { error: 'Task not found', status: 404 };
        if (task.status !== 'Completed') return { error: 'Complete the task before requesting feedback', status: 409 };
        task.feedbackToken = tokenOf(task.feedbackToken) || randomBytes(32).toString('hex');
        task.feedbackCreatedAt = task.feedbackCreatedAt || new Date().toISOString();
        return { state, response: { token: task.feedbackToken, feedback: task.feedback || null } };
      }
      if (body.action === 'revoke') {
        const task = state.tasks.find(item => item.id === body.taskId);
        if (!task) return { error: 'Task not found', status: 404 };
        task.feedbackToken = '';
        return { state };
      }
      if (body.action === 'submit') {
        const task = state.tasks.find(item => item.feedbackToken === tokenOf(body.token));
        if (!task) return { error: 'Invalid feedback link', status: 404 };
        if (task.feedback?.submittedAt) return { error: 'Feedback already submitted', status: 409 };
        const rawRating = Number(body.rating || 0);
        if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) return { error: 'Choose a star rating', status: 400 };
        const rating = rawRating;
        task.feedback = { rating, quality: Number(body.quality || rating), communication: Number(body.communication || rating), timeliness: Number(body.timeliness || rating), clientName: String(body.clientName || 'Client').slice(0, 100), comment: String(body.comment || '').slice(0, 2000), submittedAt: new Date().toISOString() };
        return { state, response: { submitted: true } };
      }
      return { error: 'Unsupported feedback action', status: 400 };
    });
    if (result.error) return json({ error: result.error }, result.status || 400);
    await logActivity(`feedback_${body.action}`, user?.name || 'Client', { taskId: body.taskId || '' });
    return json({ ok: true, token: result.token, feedback: result.feedback, submitted: result.submitted });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
