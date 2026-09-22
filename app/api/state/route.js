import { readSession } from '@/lib/server/auth';
import { bodyOf, json } from '@/lib/server/http';
import { friendlyError, logActivity, mutateState, readState } from '@/lib/server/db';
import { canAccessLead, cleanState, countsOf, memberRole, mergeTeamPins, stageFromCall, stateForRole } from '@/lib/server/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MANAGER_ROLES = ['admin', 'teamlead'];
const isImportedLead = lead => Boolean(lead?.imported || lead?.metaLeadId || /csv|meta/i.test(String(lead?.source || lead?.importSource || '')));

function billingGrand(document) {
  const items = (document?.items || []).reduce((sum, item) => {
    const hasQtyRate = item?.qty !== '' && item?.qty != null && item?.rate !== '' && item?.rate != null;
    return sum + (hasQtyRate ? Number(item.qty || 0) * Number(item.rate || 0) : Number(item?.amount || 0));
  }, 0);
  const afterDiscount = Math.max(0, items - Math.max(0, Number(document?.discount || 0)));
  const rate = Math.max(0, Number(document?.gstRate || 0));
  const taxed = document?.gstMode === 'inclusive' || !rate ? afterDiscount : afterDiscount + afterDiscount * rate / 100;
  const charges = (document?.additionalCharges || []).reduce((sum, charge) => sum + Math.max(0, Number(charge?.amount || 0)), 0);
  return taxed + charges;
}

export async function GET(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  try {
    const record = await readState();
    const full = cleanState(record.payload);
    const scoped = stateForRole(full, user);
    return json({
      found: Number(record.revision || 0) > 0,
      data: scoped,
      revision: Number(record.revision || 0),
      updatedAt: record.updatedAt || null,
      updatedBy: record.updatedBy || null,
      storage: 'mongodb',
      counts: countsOf(scoped),
      user,
    });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}

export async function POST(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  try {
    const body = await bodyOf(request);
    const operation = body.operation || {};
    const action = String(operation.type || 'update');
    let auditDetail = {};
    const result = await mutateState(user.name || 'User', currentValue => {
      const current = cleanState(currentValue);
      let next = structuredClone(current);

      if (operation.type === 'replaceState') {
        if (!['admin', 'subadmin'].includes(user.role)) return { error: 'Admin access required', status: 403 };
        const incoming = cleanState(operation.data);
        if (!body.forceEmpty && current.leads.length && !incoming.leads.length) return { error: 'Empty overwrite blocked. Refresh and try again.', status: 409 };
        incoming.team = user.role === 'subadmin' ? current.team : mergeTeamPins(current.team, incoming.team);
        next = incoming;
      } else if (operation.type === 'replaceSalesState') {
        return { error: 'Bulk sales updates are disabled. Use assigned lead actions.', status: 403 };
      } else if (operation.type === 'replaceTaskState') {
        if (user.role !== 'teamlead') return { error: 'Manager access required', status: 403 };
        const incoming = cleanState(operation.data);
        next.tasks = incoming.tasks;
        next.reminders = incoming.reminders;
      } else if (operation.type === 'upsertLead') {
        if (!['admin', 'subadmin'].includes(user.role)) return { error: 'Admin access required to create or edit leads', status: 403 };
        const lead = operation.lead && typeof operation.lead === 'object' ? structuredClone(operation.lead) : null;
        if (!lead?.id || !String(lead.phone || '').trim()) return { error: 'Phone number is required', status: 400 };
        const pinnedOthers = next.leads.filter(item => item.pinned && item.id !== lead.id).length;
        if (lead.pinned && pinnedOthers >= 10) return { error: 'Maximum 10 pinned clients', status: 400 };
        lead.lastUpdatedAt = new Date().toISOString();
        lead.createdAt = lead.createdAt || lead.lastUpdatedAt;
        const leadIndex = next.leads.findIndex(item => item.id === lead.id);
        if (leadIndex >= 0) next.leads[leadIndex] = lead;
        else next.leads.unshift(lead);
        const autoTask = operation.autoTask && typeof operation.autoTask === 'object' ? structuredClone(operation.autoTask) : null;
        if (autoTask?.id && !next.tasks.some(task => task.id === autoTask.id || (task.leadId && task.leadId === lead.id))) next.tasks.unshift(autoTask);
      } else if (operation.type === 'moveLeadStage') {
        if (!['admin', 'sales'].includes(user.role)) return { error: 'Sales access required', status: 403 };
        if (!canAccessLead(current, user, operation.leadId)) return { error: 'This lead is not assigned to you', status: 403 };
        const lead = next.leads.find(item => item.id === operation.leadId);
        if (!lead) return { error: 'Lead not found', status: 404 };
        lead.stage = String(operation.stage || 'New Lead');
        lead.lastUpdatedAt = new Date().toISOString();
      } else if (operation.type === 'markLeadCalled') {
        if (!['admin', 'sales'].includes(user.role)) return { error: 'Sales access required', status: 403 };
        if (!canAccessLead(current, user, operation.leadId)) return { error: 'This lead is not assigned to you', status: 403 };
        const lead = next.leads.find(item => item.id === operation.leadId);
        if (!lead) return { error: 'Lead not found', status: 404 };
        const at = new Date().toISOString();
        const day = at.slice(0, 10);
        if (lead.dailyDialDate !== day || lead.dailyDialState !== 'called') {
          lead.callStatus = 'called_quick';
          lead.callAttempts = Number(lead.callAttempts || 0) + 1;
          lead.dailyDialDate = day;
          lead.dailyDialState = 'called';
          lead.lastCallAt = at;
          lead.callHistory = [{ id: operation.eventId || `call_${Date.now()}`, status: 'called_quick', at, note: 'Quick marked as called', source: 'quick_mark' }, ...(lead.callHistory || [])].slice(0, 50);
        }
      } else if (operation.type === 'assignLeadToSales') {
        if (user.role !== 'admin') return { error: 'Only Admin can assign sales leads', status: 403 };
        const leadId = String(operation.leadId || '');
        const memberId = String(operation.memberId || '');
        const lead = next.leads.find(item => String(item.id) === leadId);
        if (!lead) return { error: 'Lead not found', status: 404 };
        const assignee = memberId ? next.team.find(member => String(member.id) === memberId && member.active !== false && memberRole(member) === 'sales') : null;
        if (memberId && !assignee) return { error: 'Choose a valid Sales login', status: 400 };
        next.team = next.team.map(member => {
          const assigned = new Set((member.assignedLeadIds || []).map(String));
          assigned.delete(leadId);
          if (assignee && String(member.id) === memberId) assigned.add(leadId);
          return { ...member, assignedLeadIds: [...assigned] };
        });
        auditDetail = { leadId, leadName: lead.name || lead.company || lead.phone || 'Lead', assignedMemberId: memberId, assignedMemberName: assignee?.name || 'Unassigned' };
      } else if (operation.type === 'assignLeadsToSales') {
        if (user.role !== 'admin') return { error: 'Only Admin can assign sales leads', status: 403 };
        const leadIds = [...new Set((Array.isArray(operation.leadIds) ? operation.leadIds : []).map(String).filter(Boolean))].slice(0, 2000);
        const memberId = String(operation.memberId || '');
        if (!leadIds.length) return { error: 'Select at least one lead', status: 400 };
        const validLeadIds = new Set(next.leads.filter(lead => leadIds.includes(String(lead.id))).map(lead => String(lead.id)));
        if (!validLeadIds.size) return { error: 'Selected leads were not found', status: 404 };
        const assignee = memberId ? next.team.find(member => String(member.id) === memberId && member.active !== false && memberRole(member) === 'sales') : null;
        if (memberId && !assignee) return { error: 'Choose a valid Sales login', status: 400 };
        next.team = next.team.map(member => {
          const assigned = new Set((member.assignedLeadIds || []).map(String));
          validLeadIds.forEach(leadId => assigned.delete(leadId));
          if (assignee && String(member.id) === memberId) validLeadIds.forEach(leadId => assigned.add(leadId));
          return { ...member, assignedLeadIds: [...assigned] };
        });
        auditDetail = { leadCount: validLeadIds.size, assignedMemberId: memberId, assignedMemberName: assignee?.name || 'Unassigned' };
      } else if (operation.type === 'logCallOutcome') {
        if (!['admin', 'sales'].includes(user.role)) return { error: 'Sales access required', status: 403 };
        if (!canAccessLead(current, user, operation.leadId)) return { error: 'This lead is not assigned to you', status: 403 };
        const lead = next.leads.find(item => item.id === operation.leadId);
        if (!lead) return { error: 'Lead not found', status: 404 };
        const at = new Date().toISOString();
        const follow = String(operation.follow || '');
        lead.callStatus = operation.status;
        lead.lastCallPicked = operation.picked;
        lead.lastCallAt = at;
        lead.lastCallNote = String(operation.note || '').slice(0, 300);
        lead.callAttempts = Number(lead.callAttempts || 0) + 1;
        lead.follow = follow;
        lead.followTime = String(operation.followTime || '');
        lead.stage = stageFromCall(operation.status, follow);
        lead.dailyDialDate = at.slice(0, 10);
        lead.dailyDialState = 'called';
        lead.callHistory = [{ id: operation.eventId || `call_${Date.now()}`, picked: operation.picked, status: operation.status, at, note: lead.lastCallNote, follow, followTime: lead.followTime }, ...(lead.callHistory || []).filter(item => item.source !== 'quick_mark')].slice(0, 50);
      } else if (operation.type === 'deleteImportedLeads') {
        if (!['admin', 'subadmin'].includes(user.role)) return { error: 'Admin access required', status: 403 };
        const requestedIds = Array.isArray(operation.leadIds) ? operation.leadIds.map(String).slice(0, 5000) : [];
        if (!requestedIds.length) return { error: 'Select at least one imported lead', status: 400 };
        const requested = new Set(requestedIds);
        const deletedLeads = next.leads.filter(lead => requested.has(String(lead.id)) && isImportedLead(lead));
        if (!deletedLeads.length) return { error: 'No imported leads matched the selection', status: 400 };
        next.leads = next.leads.filter(lead => !(requested.has(String(lead.id)) && isImportedLead(lead)));
        const batchId = String(operation.batchId || `lead_trash_${Date.now()}`).slice(0, 120);
        next.leadTrash = [{ batchId, deletedAt: new Date().toISOString(), deletedBy: user.name, leads: deletedLeads }, ...(next.leadTrash || []).filter(batch => String(batch.batchId) !== batchId)].slice(0, 20);
      } else if (operation.type === 'undoDeleteImportedLeads') {
        if (!['admin', 'subadmin'].includes(user.role)) return { error: 'Admin access required', status: 403 };
        const trash = Array.isArray(next.leadTrash) ? next.leadTrash : [];
        const batchId = String(operation.batchId || '');
        const batchIndex = batchId ? trash.findIndex(batch => String(batch.batchId) === batchId) : 0;
        if (batchIndex < 0 || !trash[batchIndex]) return { error: 'No deleted lead batch is available to undo', status: 400 };
        const existingIds = new Set(next.leads.map(lead => String(lead.id)));
        const restored = (trash[batchIndex].leads || []).filter(lead => !existingIds.has(String(lead.id)));
        if (!restored.length) return { error: 'These leads are already present', status: 400 };
        next.leads = [...restored, ...next.leads];
        next.leadTrash = trash.filter((_, index) => index !== batchIndex);
      } else if (operation.type === 'upsertBillingDocument') {
        if (!['admin', 'subadmin'].includes(user.role)) return { error: 'Billing access required', status: 403 };
        const document = operation.document && typeof operation.document === 'object' ? structuredClone(operation.document) : null;
        if (!document?.id || !['sales_invoice', 'quotation', 'estimate', 'proforma', 'invoice'].includes(document.kind)) return { error: 'Invalid billing document', status: 400 };
        if (!String(document.clientName || '').trim()) return { error: 'Enter billed-to name', status: 400 };
        if (!Array.isArray(document.items) || !document.items.length) return { error: 'Add at least one item', status: 400 };
        document.updatedAt = new Date().toISOString();
        document.createdAt = document.createdAt || document.updatedAt;
        const documentIndex = next.documents.findIndex(item => item.id === document.id);
        if (documentIndex >= 0) next.documents[documentIndex] = document;
        else next.documents.unshift(document);
        const lead = next.leads.find(item => item.id === document.leadId);
        if (lead) {
          const total = Number(billingGrand(document) || 0);
          if (['quotation', 'estimate', 'proforma'].includes(document.kind)) {
            lead.quote = total;
            if (['New Lead', 'Contacted'].includes(String(lead.stage || 'New Lead'))) lead.stage = 'Proposal Sent';
          } else {
            lead.deal = Math.max(Number(lead.deal || 0), total);
            lead.paid = Math.max(Number(lead.paid || 0), Number(document.paid || 0));
            if (document.dueDate) lead.collectionDate = document.dueDate;
            if (!lead.collectionNote) lead.collectionNote = `Invoice #${document.number}`;
          }
          lead.lastUpdatedAt = document.updatedAt;
        }
      } else if (operation.type === 'updateTaskChecklistItem') {
        const task = next.tasks.find(item => item.id === operation.taskId);
        if (!task) return { error: 'Task not found', status: 404 };
        const assigned = task.assignee === user.memberId || task.assignees?.includes(user.memberId);
        if (!MANAGER_ROLES.includes(user.role) && !assigned) return { error: 'This task is not assigned to you', status: 403 };
        const item = (task.checklist || []).find(entry => entry.id === operation.itemId);
        if (!item) return { error: 'Checklist item not found', status: 404 };
        item.done = operation.done === true;
        item.completedAt = item.done ? new Date().toISOString() : '';
        item.completedBy = item.done ? user.name : '';
      } else if (operation.type === 'updateTaskProgress') {
        const task = next.tasks.find(item => item.id === operation.taskId);
        const assigned = task && (task.assignee === user.memberId || task.assignees?.includes(user.memberId));
        if (!task || (!assigned && user.role === 'team')) return { error: 'This task is not assigned to you', status: 403 };
        task.status = ['In Progress', 'Completed'].includes(operation.status) ? operation.status : task.status;
        task.workUpdate = String(operation.workUpdate || '').slice(0, 2500);
        task.workLink = String(operation.workLink || '').slice(0, 500);
        task.completedAt = task.status === 'Completed' ? (task.completedAt || new Date().toISOString()) : '';
      } else {
        return { error: 'Unsupported operation', status: 400 };
      }

      return { state: next };
    });

    if (result.error) return json({ error: result.error }, result.status || 400);
    await logActivity(action, user.name, { role: user.role, memberId: user.memberId || '', ...auditDetail });
    const lightweight = ['upsertLead', 'upsertBillingDocument', 'assignLeadToSales', 'assignLeadsToSales'].includes(action);
    const scoped = stateForRole(result.state, user);
    return json({ ok: true, ...(lightweight ? {} : { data: scoped }), revision: result.revision, counts: countsOf(scoped), storage: 'mongodb' });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
