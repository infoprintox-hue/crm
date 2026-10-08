import { blankState } from './db.js';
import { emailIdentityKey, importFieldLabel, isContactImportField, isTechnicalImportField, phoneIdentityKey } from '../client/business.js';

const ARRAYS = ['team', 'leads', 'tasks', 'finance', 'importHistory', 'reminders', 'leadTrash', 'documents'];

const IMPORTED_CONTACT_FIELDS = ['name', 'company', 'phone', 'email', 'city', 'state', 'service'];
const IMPORTED_ANSWER_FIELDS = ['businessType', 'profilePages', 'profileBudget', 'contentReadiness', 'websiteBudget', 'serverRequirement'];
const CONTACT_FORM_KEYS = new Set([
  'full_name', 'name', 'contact_name', 'customer_name', 'lead_name', 'first_name', 'last_name',
  'phone', 'phone_number', 'phone_no', 'mobile', 'mobile_number', 'mobile_no', 'contact_number', 'contact_phone',
  'whatsapp', 'whatsapp_number', 'whatsapp_no', 'telephone',
  'email', 'email_address', 'email_id', 'e_mail', 'contact_email',
  'company', 'company_name', 'business_name', 'organisation', 'organization',
  'address', 'street_address', 'city', 'city_name', 'district', 'location', 'state', 'state_name', 'province',
  'postal_code', 'postcode', 'zip_code', 'pincode',
]);
function importedText(value, limit = 300) {
  return String(value ?? '').trim().slice(0, limit);
}

function importedFieldKey(value) {
  const source = String(value ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return source
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
}

function visibleFormLabel(value, fallbackKey) {
  return importFieldLabel(value, fallbackKey).slice(0, 600);
}

function importedAnswer(value, limit = 2000) {
  if (Array.isArray(value)) return value.map(item => importedText(item, 500)).filter(item => item && !/^(?:-|—|–|n\/?a|none|null|undefined|not available)$/i.test(item)).join(', ').slice(0, limit);
  if (value && typeof value === 'object') return '';
  const answer = importedText(value, limit);
  return answer && !/^(?:-|—|–|n\/?a|none|null|undefined|not available)$/i.test(answer) ? answer : '';
}

export function sanitizeImportedFormFields(value, { includeContact = false, limit = Number.POSITIVE_INFINITY } = {}) {
  const source = Array.isArray(value) ? value : [];
  const fields = [];
  const positions = new Map();
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue;
    const rawKey = raw.key || raw.name || raw.label;
    const rawLabel = raw.label || raw.name || raw.key;
    const key = importedFieldKey(rawKey);
    const labelKey = importedFieldKey(rawLabel);
    const filterKey = String(rawKey || '').replace(/^meta(?:[_\s:|/\\\-–—]+|$)/i, '');
    const filterLabel = String(rawLabel || '').replace(/^meta(?:[_\s:|/\\\-–—]+|$)/i, '');
    if (!key || isTechnicalImportField(filterKey, filterLabel)) continue;
    if (!includeContact && (CONTACT_FORM_KEYS.has(key) || CONTACT_FORM_KEYS.has(labelKey) || isContactImportField(filterKey, filterLabel))) continue;
    const fieldValue = importedAnswer(raw.value ?? raw.displayValue);
    const displayValue = importedAnswer(raw.displayValue ?? raw.value);
    if (!fieldValue && !displayValue) continue;
    const field = {
      key,
      label: visibleFormLabel(raw.label || raw.name || key, key),
      value: fieldValue || displayValue,
      displayValue: displayValue || fieldValue,
      isFormAnswer: true,
    };
    if (positions.has(key)) fields[positions.get(key)] = field;
    else {
      positions.set(key, fields.length);
      fields.push(field);
      if (fields.length >= limit) break;
    }
  }
  return fields;
}

function legacyFormFields(lead) {
  const answers = lead?.metaAnswers && typeof lead.metaAnswers === 'object'
    ? Object.entries(lead.metaAnswers).map(([key, value]) => ({ key, label: key, value, displayValue: value, isFormAnswer: true }))
    : [];
  return [
    ...answers,
    ...(Array.isArray(lead?.metaAllFields) ? lead.metaAllFields : []),
    ...(Array.isArray(lead?.formFields) ? lead.formFields : []),
  ];
}

export function normalizeImportedPhone(value) {
  return phoneIdentityKey(value);
}

function normalizedExternalLeadId(value) {
  return importedText(value, 240).normalize('NFKC').replace(/^'/, '').toLowerCase();
}

function normalizedImportedEmail(value) {
  return emailIdentityKey(importedText(value, 240));
}

export function safeImportedLead(value, fileName = 'Imported CSV', index = 0, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const importedCreatedAt = importedText(source.createdAt, 40);
  const fallbackTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const name = importedText(source.name, 180);
  const company = importedText(source.company, 220);
  const phone = importedText(source.phone, 40);
  const email = importedText(source.email, 240);
  const externalLeadId = importedText(source.externalLeadId || source.metaLeadId || source.external_id, 240).replace(/^'/, '');
  if (!normalizedExternalLeadId(externalLeadId) && !normalizeImportedPhone(phone) && !normalizedImportedEmail(email)) return null;
  const lead = {
    id: importedText(source.id, 120) || `lead_csv_${fallbackTime.toString(36)}_${index.toString(36)}`,
    name,
    company,
    phone,
    email,
    city: importedText(source.city, 160),
    state: importedText(source.state, 160),
    service: importedText(source.service || source.metaRequestedService, 160),
    notes: importedText(source.notes, 3000),
    department: source.department === 'website' ? 'website' : source.department === 'profile' ? 'profile' : '',
    stage: 'New Lead',
    temp: 'Warm',
    callStatus: 'not_called',
    imported: true,
    source: 'CSV',
    importSource: 'CSV',
    importFileName: importedText(fileName || source.importFileName || 'Imported CSV', 180),
    createdAt: /^\d{4}-\d{2}-\d{2}T/.test(importedCreatedAt) && Number.isFinite(Date.parse(importedCreatedAt))
      ? importedCreatedAt
      : new Date(fallbackTime + index).toISOString(),
    formFields: sanitizeImportedFormFields(source.formFields),
  };
  const canonical = {
    externalLeadId,
    businessType: source.businessType || source.metaBusiness,
    profilePages: source.profilePages,
    profileBudget: source.profileBudget || source.metaBudget,
    contentReadiness: source.contentReadiness,
    websiteBudget: source.websiteBudget,
    serverRequirement: source.serverRequirement,
  };
  for (const [key, fieldValue] of Object.entries(canonical)) {
    const cleanValue = importedText(fieldValue, key === 'externalLeadId' ? 240 : 600);
    if (cleanValue) lead[key] = cleanValue;
  }
  return lead;
}

function mergeFormFields(existingFields, incomingFields) {
  const merged = sanitizeImportedFormFields(existingFields, { limit: Number.POSITIVE_INFINITY });
  const positions = new Map(merged.map((field, index) => [field.key, index]));
  for (const field of sanitizeImportedFormFields(incomingFields)) {
    if (positions.has(field.key)) merged[positions.get(field.key)] = field;
    else {
      positions.set(field.key, merged.length);
      merged.push(field);
    }
  }
  return merged;
}

function importFingerprint(lead) {
  const comparable = {};
  for (const key of [...IMPORTED_CONTACT_FIELDS, ...IMPORTED_ANSWER_FIELDS, 'externalLeadId']) {
    const value = importedText(lead?.[key], 2000);
    if (value) comparable[key] = value;
  }
  comparable.formFields = sanitizeImportedFormFields(lead?.formFields);
  return JSON.stringify(comparable);
}

function importMetadata(lead, { importId, fileName, importedAt, duplicateMode }, isNew = false) {
  return {
    ...lead,
    imported: true,
    ...(isNew ? { source: 'CSV', importedAt } : {}),
    importSource: 'CSV',
    importFileName: fileName,
    importId,
    lastImportId: importId,
    lastImportAt: importedAt,
    lastImportMode: duplicateMode,
    lastImportFingerprint: importFingerprint(lead),
  };
}

export function mergeImportedLead(existing, incoming, metadata) {
  const merged = { ...existing };
  for (const key of [...IMPORTED_CONTACT_FIELDS, ...IMPORTED_ANSWER_FIELDS, 'externalLeadId']) {
    const value = importedText(incoming?.[key], key === 'externalLeadId' ? 240 : 2000);
    if (value) merged[key] = value;
  }
  merged.formFields = mergeFormFields(legacyFormFields(existing), incoming?.formFields);
  return importMetadata(merged, metadata, false);
}

function matchImportedLead(leads, incoming) {
  const matchBy = selector => {
    const matches = [];
    for (let index = 0; index < leads.length; index += 1) {
      if (selector(leads[index])) matches.push(index);
    }
    return matches;
  };
  const externalLeadId = normalizedExternalLeadId(incoming?.externalLeadId);
  if (externalLeadId) {
    const matches = matchBy(lead => normalizedExternalLeadId(lead?.externalLeadId || lead?.metaLeadId || lead?.external_id) === externalLeadId);
    if (matches.length) return { matches, matchedBy: 'externalLeadId' };
  }
  const phone = normalizeImportedPhone(incoming?.phone);
  if (phone) {
    const matches = matchBy(lead => normalizeImportedPhone(lead?.phone || lead?.mobile || lead?.phoneNumber) === phone);
    if (matches.length) return { matches, matchedBy: 'phone' };
  }
  const email = normalizedImportedEmail(incoming?.email);
  if (email) {
    const matches = matchBy(lead => normalizedImportedEmail(lead?.email || lead?.emailAddress) === email);
    if (matches.length) return { matches, matchedBy: 'email' };
  }
  return { matches: [], matchedBy: '' };
}

export function importLeadBatch(existingLeads, rawLeads, options = {}) {
  const base = Array.isArray(existingLeads) ? existingLeads.map(lead => ({ ...lead })) : [];
  const added = [];
  const source = Array.isArray(rawLeads) ? rawLeads : [];
  const importedAt = options.importedAt || new Date().toISOString();
  const importId = importedText(options.importId, 120) || `import_${Date.now().toString(36)}`;
  const fileName = importedText(options.fileName || 'Imported CSV', 180);
  const duplicateMode = options.duplicateMode === 'replace' ? 'replace' : 'skip';
  const metadata = { importId, fileName, importedAt, duplicateMode };
  const summary = { added: 0, replaced: 0, skippedExisting: 0, invalid: 0, repeated: 0, ambiguous: 0 };
  const usedIds = new Set(base.map(lead => String(lead?.id || '')).filter(Boolean));
  const seenIncoming = [];
  const seenFingerprints = new Set(
    base
      .filter(lead => String(lead?.lastImportId || lead?.importId || '') === importId)
      .map(lead => String(lead?.lastImportFingerprint || ''))
      .filter(Boolean),
  );

  const batchTime = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  source.forEach((raw, index) => {
    const incoming = safeImportedLead(raw, fileName, index, batchTime);
    if (!incoming) {
      summary.invalid += 1;
      return;
    }
    const fingerprint = importFingerprint(incoming);
    const repeatMatch = matchImportedLead(seenIncoming, incoming);
    if (seenFingerprints.has(fingerprint) || repeatMatch.matches.length) {
      summary.repeated += 1;
      seenIncoming.push(incoming);
      seenFingerprints.add(fingerprint);
      return;
    }
    seenIncoming.push(incoming);
    seenFingerprints.add(fingerprint);
    const pool = [...base, ...added];
    const match = matchImportedLead(pool, incoming);
    if (match.matches.length > 1) {
      summary.ambiguous += 1;
      return;
    }
    if (match.matches.length === 1) {
      const poolIndex = match.matches[0];
      const matched = pool[poolIndex];
      if (String(matched?.lastImportId || matched?.importId || '') === importId) {
        summary.repeated += 1;
        return;
      }
      if (duplicateMode === 'skip') {
        summary.skippedExisting += 1;
        return;
      }
      const replacement = mergeImportedLead(matched, incoming, metadata);
      replacement.lastImportFingerprint = fingerprint;
      if (poolIndex < base.length) base[poolIndex] = replacement;
      else added[poolIndex - base.length] = replacement;
      summary.replaced += 1;
      return;
    }

    let leadId = String(incoming.id || `lead_csv_${Date.now().toString(36)}_${index.toString(36)}`);
    if (usedIds.has(leadId)) {
      const baseId = leadId;
      let suffix = 1;
      do {
        leadId = `${baseId}_${index.toString(36)}_${suffix.toString(36)}`;
        suffix += 1;
      } while (usedIds.has(leadId));
    }
    usedIds.add(leadId);
    const newLead = importMetadata({
      ...incoming,
      id: leadId,
      service: incoming.service || 'Company Profile',
      department: incoming.department || (/website/i.test(incoming.service || incoming.serverRequirement || '') ? 'website' : 'profile'),
    }, metadata, true);
    newLead.lastImportFingerprint = fingerprint;
    added.push(newLead);
    summary.added += 1;
  });

  return { leads: [...added, ...base], summary, importId, fileName, importedAt, duplicateMode };
}

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
    'websiteBudget', 'serverRequirement', 'metaBusiness', 'metaBudget', 'metaRequestedService', 'callStatus', 'callAttempts', 'lastCallAt',
    'lastCallPicked', 'lastCallNote', 'callHistory', 'dailyDialDate', 'dailyDialState', 'createdAt', 'lastUpdatedAt',
    'lastMetaImportAt', 'metaCreatedTime', '_v47PipelineRemoved',
  ];
  const safe = Object.fromEntries(allowed.filter(key => lead?.[key] !== undefined).map(key => [key, structuredClone(lead[key])]));
  safe.formFields = sanitizeImportedFormFields(legacyFormFields(lead), { limit: Number.POSITIVE_INFINITY });
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
