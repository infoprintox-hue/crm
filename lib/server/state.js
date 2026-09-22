import { blankState } from './db.js';

const ARRAYS = ['team', 'leads', 'tasks', 'finance', 'importHistory', 'reminders', 'leadTrash', 'documents'];

export function cleanState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const state = { ...blankState(), ...source };
  for (const key of ARRAYS) state[key] = Array.isArray(source[key]) ? source[key] : [];
  state.profile = source.profile && typeof source.profile === 'object' ? source.profile : { photo: '', name: '' };
  state.billingProfile = source.billingProfile && typeof source.billingProfile === 'object' ? source.billingProfile : {};
  state.team = state.team.map(member => {
    const { pin, ...safeMember } = member || {};
    return {
      ...safeMember,
      assignedLeadIds: [...new Set((Array.isArray(member?.assignedLeadIds) ? member.assignedLeadIds : []).map(String).filter(Boolean))],
      phoneRevealLimit: Math.min(200, Math.max(1, Number(member?.phoneRevealLimit || 25))),
    };
  });
  return state;
}

export function memberRole(member) {
  const explicit = String(member?.accessRole || '').toLowerCase();
  if (['admin', 'subadmin', 'sales', 'teamlead', 'team'].includes(explicit)) return explicit;
  return /sales|business development|caller|telecaller/i.test(String(member?.role || '')) ? 'sales' : 'team';
}

export function publicMember(member, includeLeadAccess = false) {
  const { pin, pinHash, assignedLeadIds, phoneRevealLimit, ...safe } = member || {};
  return {
    ...safe,
    ...(includeLeadAccess ? {
      assignedLeadIds: Array.isArray(assignedLeadIds) ? assignedLeadIds : [],
      phoneRevealLimit: Math.min(200, Math.max(1, Number(phoneRevealLimit || 25))),
    } : {}),
    hasPin: Boolean(pinHash),
  };
}

export function mergeTeamPins(currentTeam, incomingTeam) {
  const byId = new Map((currentTeam || []).map(member => [member.id, member]));
  return (incomingTeam || []).map(member => ({
    ...member,
    pinHash: member.pinHash || byId.get(member.id)?.pinHash || '',
  }));
}

export function salesMember(state, session) {
  if (session?.role !== 'sales' || !session?.memberId) return null;
  return (state?.team || []).find(member => member.id === session.memberId && member.active !== false) || null;
}

export function canAccessLead(state, session, leadId) {
  if (session?.role !== 'sales') return true;
  const member = salesMember(state, session);
  return Boolean(member && (member.assignedLeadIds || []).map(String).includes(String(leadId || '')));
}

export function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return `${'•'.repeat(Math.max(4, Math.min(7, digits.length - 4)))} ${digits.slice(-4)}`;
}

function salesLead(lead) {
  const allowed = [
    'id', 'name', 'company', 'city', 'state', 'service', 'stage', 'temp', 'temperature', 'follow', 'followTime',
    'notes', 'pinned', 'pinLabel', 'department', 'businessType', 'profilePages', 'profileBudget', 'contentReadiness',
    'websiteBudget', 'metaBusiness', 'metaBudget', 'metaRequestedService', 'callStatus', 'callAttempts', 'lastCallAt',
    'lastCallPicked', 'lastCallNote', 'callHistory', 'dailyDialDate', 'dailyDialState', 'createdAt', 'lastUpdatedAt',
    'lastMetaImportAt', 'metaCreatedTime', '_v47PipelineRemoved',
  ];
  const safe = Object.fromEntries(allowed.filter(key => lead?.[key] !== undefined).map(key => [key, structuredClone(lead[key])]));
  const privateField = /phone|mobile|email|contact|full.?name|campaign|ad.?set|ad.?id|form.?id|lead.?id|gclid|fbclid|utm/i;
  safe.metaAllFields = (Array.isArray(lead?.metaAllFields) ? lead.metaAllFields : []).filter(field => !privateField.test(`${field?.key || ''} ${field?.name || ''} ${field?.label || ''}`)).map(field => ({ key: field.key, label: field.label, value: field.value, displayValue: field.displayValue, isFormAnswer: field.isFormAnswer })).slice(0, 30);
  safe.phone = maskPhone(lead?.phone);
  safe.phoneLast4 = String(lead?.phone || '').replace(/\D/g, '').slice(-4);
  safe._phoneRestricted = true;
  return safe;
}

export function stateForRole(full, session) {
  const state = cleanState(full);
  const team = state.team.filter(member => member.active !== false).map(member => publicMember(member, session.role === 'admin'));
  if (session.role === 'team') {
    const assigned = task => task.assignee === session.memberId || task.assignees?.includes(session.memberId);
    return { ...blankState(), team, tasks: state.tasks.filter(assigned) };
  }
  if (session.role === 'teamlead') return { ...blankState(), team, tasks: state.tasks, reminders: state.reminders.filter(item => item.kind === 'task') };
  if (session.role === 'sales') {
    const member = salesMember(state, session);
    const assigned = new Set((member?.assignedLeadIds || []).map(String));
    return {
      ...blankState(),
      team: member ? [publicMember(member)] : [],
      leads: state.leads.filter(lead => assigned.has(String(lead.id))).map(salesLead),
    };
  }
  return { ...state, team };
}

export function countsOf(state) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    leads: state.leads.length,
    followUps: state.leads.filter(lead => lead.follow).length,
    dueToday: state.leads.filter(lead => lead.follow === today).length,
    tasks: state.tasks.length,
    documents: state.documents.length,
  };
}

export function stageFromCall(status, follow) {
  if (status === 'converted') return 'Converted / Payment Done';
  if (['not_interested', 'wrong_number'].includes(status)) return 'Archived';
  if (['no_answer', 'busy'].includes(status)) return 'Not picked';
  if (status === 'proposal_sent') return 'Proposal Sent';
  if (status === 'thinking') return 'Thinking';
  if (follow) return 'Follow-up';
  return 'Contacted';
}
