'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { balance, csvRecordToLead, decodeCsvBytes, downloadCsv, importFieldLabel, initials, isContactImportField, isTechnicalImportField, money, normaliseStage, parseCsvDocument, SERVICES, shortDate, STAGES, today, uid } from '@/lib/client/business';
import { Button, Empty, Field, Modal, Search } from '../ui';

const MAX_PINNED = 10;
const PIN_LABELS = ['Very Important Client', 'Best Client', 'PIN'];
const BLANK_LEAD = {
  name: '', company: '', phone: '', email: '', city: '', state: '', service: 'Company Profile',
  stage: 'New Lead', temp: 'Warm', quote: '', deal: '', advance: '', paid: '', delivery: '',
  follow: '', followTime: '', collectionDate: '', collectionTime: '', collectionOwner: '',
  collectionPriority: 'Medium', collectionNote: '', notes: '', pinned: false, pinLabel: 'Very Important Client',
};

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function stamp(lead) { return Date.parse(lead.lastMetaImportAt || lead.metaCreatedTime || lead.createdAt || lead.lastCallAt || '') || 0; }
function isCalled(lead) { return Boolean(lead.lastCallAt || lead.manualCalledAt || Number(lead.callAttempts || 0) || (lead.callHistory || []).length || lead.dailyDialState === 'called'); }
function isActive(lead) { return !['Converted / Payment Done', 'Archived'].includes(normaliseStage(lead.stage)) && !lead._v47PipelineRemoved; }
function needsFollowup(lead) { return isActive(lead) && /^\d{4}-\d{2}-\d{2}$/.test(String(lead.follow || '')); }
function needsCall(lead) { return isActive(lead) && !needsFollowup(lead); }
function cleanLeadNotes(value) { return String(value || '').replace(/^meta\s+(?:form|lead)\s*[—–:-]\s*/i, '').trim(); }

function requirementLabel(value, fallback = '') {
  const text = importFieldLabel(value, fallback).replace(/^\uFEFF/, '').trim().replace(/[_-]+/g, ' ').replace(/\bmeta\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.replace(/\b\w/g, character => character.toUpperCase());
}

function requirementIdentity(value) {
  return String(value || '').replace(/^\uFEFF/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function mappedRequirementKind(key, label) {
  const identities = [key, label].map(requirementIdentity);
  if (identities.some(value => value === 'do_you_want_server_from_us' || /(?:^|_)(?:server|hosting|domain).*(?:requirement|required|needed|hosting)(?:_|$)/.test(value))) return 'serverRequirement';
  if (identities.some(value => /(?:business_type|type_of_business|company_type|industry|nature_of_business|business.*operate)/.test(value))) return 'businessType';
  if (identities.some(value => /(?:profile.*pages|pages.*profile|how_many_pages)/.test(value))) return 'profilePages';
  if (identities.some(value => value === 'what_is_your_approximate_budget' || /(?:profile.*budget|budget.*profile|approximate_budget.*company)/.test(value))) return 'profileBudget';
  if (identities.some(value => /(?:content.*ready|ready.*content|content_availability)/.test(value))) return 'contentReadiness';
  if (identities.some(value => /(?:website.*(?:budget|requirement)|(?:budget|requirement).*website)/.test(value))) return 'websiteBudget';
  return '';
}

export function leadRequirementRows(lead) {
  const formFields = Array.isArray(lead?.formFields) ? lead.formFields : [];
  const legacyFields = Array.isArray(lead?.metaAllFields) ? lead.metaAllFields : [];
  const legacyAnswers = Object.entries(lead?.metaAnswers || {}).map(([key, value]) => ({ key, label: key, value, displayValue: value, isFormAnswer: true }));
  const source = [...formFields, ...legacyFields, ...legacyAnswers];
  const rows = [];
  const seen = new Set();
  const sourceKinds = new Set();
  const add = (label, value, identity = '') => {
    const cleanLabel = requirementLabel(label, identity);
    const cleanValue = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!cleanLabel || !cleanValue || /^(?:-|—|n\/?a|none|null|undefined|not available)$/i.test(cleanValue)) return false;
    const rowIdentity = requirementIdentity(identity || cleanLabel);
    const seenKey = `${rowIdentity}\u0000${cleanValue.toLowerCase()}`;
    if (seen.has(seenKey)) return false;
    seen.add(seenKey);
    rows.push([cleanLabel, cleanValue]);
    return true;
  };
  source.forEach(field => {
    const key = String(field?.key || field?.name || '');
    const label = String(field?.label || key);
    const visibleLabel = requirementLabel(label || key, key);
    if (isTechnicalImportField(key, visibleLabel) || isContactImportField(key, visibleLabel)) return;
    if (add(visibleLabel, field?.displayValue ?? field?.value, key || label)) {
      const kind = mappedRequirementKind(key, label);
      if (kind) sourceKinds.add(kind);
    }
  });
  if (!sourceKinds.has('serverRequirement')) add('Server requirement', lead?.serverRequirement, 'mapped_server_requirement');
  if (!sourceKinds.has('businessType')) add('Business type', lead?.businessType || lead?.metaBusiness, 'mapped_business_type');
  if (!sourceKinds.has('profilePages')) add('Profile pages', lead?.profilePages, 'mapped_profile_pages');
  if (!sourceKinds.has('profileBudget')) add('Profile budget', lead?.profileBudget || lead?.metaBudget, 'mapped_profile_budget');
  if (!sourceKinds.has('contentReadiness')) add('Content readiness', lead?.contentReadiness, 'mapped_content_readiness');
  if (!sourceKinds.has('websiteBudget')) add('Website requirement / budget', lead?.websiteBudget, 'mapped_website_budget');
  return rows;
}

export function whatsappDigits(phone) {
  let value = digits(phone);
  if (value.startsWith('0') && value.length === 11) value = value.slice(1);
  if (value.length === 10) value = `91${value}`;
  return value.length >= 12 && value.length <= 15 ? value : '';
}

export function leadWhatsAppMessage(lead) {
  const name = String(lead?.name || '').trim();
  const requested = [lead?.service, lead?.metaRequestedService].map(value => String(value || '').trim()).find(value => value && !/^other$/i.test(value));
  const rows = [...leadRequirementRows(lead)];
  if (lead?.city && !rows.some(([label]) => label === 'City')) rows.push(['City', String(lead.city).trim()]);
  const lines = [
    `Hello ${name || 'Sir'},`,
    '',
    'Thank you for contacting Visitinglink.',
    requested ? `You requested ${requested} through our form.` : 'We received the requirement you shared through our form.',
  ];
  if (rows.length) {
    lines.push('', 'Details you shared:');
    rows.forEach(([label, value]) => lines.push(`• ${label}: ${value}`));
  }
  lines.push('', 'Please reply to this message or call us so we can discuss your requirement and assist you.', 'If you would like a call, reply YES.');
  return lines.join('\n');
}

export function leadWhatsAppHref(lead) {
  const phone = whatsappDigits(lead?.phone);
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(leadWhatsAppMessage(lead))}` : '';
}

function PinBadge({ lead }) {
  if (!lead?.pinned) return null;
  const label = PIN_LABELS.includes(lead.pinLabel) ? lead.pinLabel : PIN_LABELS[0];
  return <span className="vl-pin-inline" title={label} aria-label={label}><span aria-hidden="true">📌</span></span>;
}

function WhatsAppIcon({ lead, restricted = false, onSecureAction }) {
  if (restricted) return <button type="button" className="v22-whatsapp secure" aria-label={`Open WhatsApp for ${lead.name || 'lead'}`} title="Open WhatsApp (logged)" onClick={event => { event.stopPropagation(); onSecureAction(lead, 'whatsapp'); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.7 9.7 0 0 0-8.4 14.55L2.2 21.8l5.38-1.4A9.8 9.8 0 1 0 12 2Zm0 17.7a8 8 0 0 1-4.08-1.12l-.29-.17-3.19.83.85-3.1-.19-.3A8 8 0 1 1 12 19.7Zm4.38-5.98c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.64-1.2-1.42-1.34-1.66-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" /></svg></button>;
  const href = leadWhatsAppHref(lead);
  if (!href) return null;
  return <a className="v22-whatsapp" href={href} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${lead.name || 'lead'} with requirement message`} title="Send WhatsApp message" onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} draggable="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.7 9.7 0 0 0-8.4 14.55L2.2 21.8l5.38-1.4A9.8 9.8 0 1 0 12 2Zm0 17.7a8 8 0 0 1-4.08-1.12l-.29-.17-3.19.83.85-3.1-.19-.3A8 8 0 1 1 12 19.7Zm4.38-5.98c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.64-1.2-1.42-1.34-1.66-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" /></svg></a>;
}

export function leadDepartment(lead) {
  if (lead?.department === 'website' || lead?.department === 'profile') return lead.department;
  const form = String(lead?.metaForm || '').toLowerCase();
  if (/website|web[\s-]?design|web site|landing page/.test(form) && !/company\s*profile|profile design/.test(form)) return 'website';
  if (/company\s*profile|profile design|business profile|brochure profile/.test(form) && !/website|web[\s-]?design/.test(form)) return 'profile';
  const blob = [lead?.service, lead?.metaRequestedService, lead?.importFileName, lead?.metaCampaign, lead?.metaAd].join(' ').toLowerCase();
  if (String(lead?.service || '') === 'Website') return 'website';
  if (/website|web[\s-]?design|web site|landing page/.test(blob) && !/company\s*profile|profile/.test(blob)) return 'website';
  return 'profile';
}

function dayKey(lead) {
  const value = stamp(lead);
  return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : 'unknown';
}

function dayLabel(key) {
  if (key === 'unknown') return 'Date unknown';
  const current = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const previous = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (key === current) return 'Today';
  if (key === previous) return 'Yesterday';
  return shortDate(key);
}

function copyPhone(lead, notify) {
  const value = String(lead.phone || '').trim();
  if (!value) return notify('Phone number not available');
  navigator.clipboard?.writeText(value).then(() => notify('Phone number copied')).catch(() => notify(value));
}

function downloadAlarm(lead, notify) {
  if (!lead.follow || !lead.followTime) return notify('Choose follow-up date and call time first');
  const start = new Date(`${lead.follow}T${lead.followTime}:00`);
  if (Number.isNaN(start.getTime())) return notify('Follow-up date or time is invalid');
  const compact = value => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const end = new Date(start.getTime() + 15 * 60000);
  const details = [lead.phone && `Phone: ${lead.phone}`, lead.company && `Business: ${lead.company}`, lead.service && `Service: ${lead.service}`, lead.notes && `Notes: ${lead.notes}`].filter(Boolean).join('\n');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'PRODID:-//Visitinglink//Call Alarm//EN', 'BEGIN:VEVENT', `UID:visitinglink-${lead.id}-${start.getTime()}@visitinglink.in`, `DTSTAMP:${compact(new Date())}`, `DTSTART:${compact(start)}`, `DTEND:${compact(end)}`, `SUMMARY:${clean(`Call ${lead.name || lead.phone || 'lead'}`)}`, `DESCRIPTION:${clean(details)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT10M', `DESCRIPTION:${clean(`Call reminder: ${lead.name || lead.phone || 'lead'}`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Call-${String(lead.name || lead.phone || 'lead').replace(/[^a-z0-9]+/gi, '-')}-${lead.follow.replaceAll('-', '')}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
  notify('Alarm file downloaded');
}

function LeadAssignment({ lead, salesMembers, onAssign }) {
  const assigned = salesMembers.find(member => (member.assignedLeadIds || []).includes(lead.id));
  return <select className="lead-assignee-select" value={assigned?.id || ''} onChange={event => onAssign(lead, event.target.value)} aria-label={`Assign ${lead.name || 'lead'} to sales person`} title="Assign this lead to a Sales login"><option value="">Assign to…</option>{salesMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>;
}

function LeadQueueRow({ lead, index, onEdit, onCall, onMark, notify, restricted = false, onSecureAction, salesMembers = [], onAssign, selectionMode = false, selected = false, onSelect }) {
  const called = isCalled(lead);
  return <article className={`v76-card ${called ? 'has-called' : ''} ${lead.pinned ? 'is-pinned' : ''} ${index === 1 ? 'is-first' : ''}`} draggable onDragStart={event => event.dataTransfer.setData('text/lead-id', lead.id)} onClick={() => onEdit(lead)}>
    {selectionMode && <label className="lead-bulk-check" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onSelect(lead.id)} /><span aria-hidden="true" /></label>}
    <div className="v76-num" aria-label={`Call ${index}`}>{index}</div>
    <div className="v76-info"><div className="v76-line1"><span className="v76-name" title={lead.name || 'Name not added'}>{lead.name || 'Name not added'}</span><PinBadge lead={lead} />{called && <span className="v76-tag called">Called</span>}</div><div className={`v76-phone ${restricted && !lead._phoneRevealed ? 'is-masked' : ''}`}>{lead.phone || 'No phone'}{restricted && !lead._phoneRevealed && <small> · protected</small>}</div>{needsFollowup(lead) && <div className="v76-when">Follow-up · {shortDate(lead.follow)} {lead.followTime || ''}</div>}</div>
    <div className="v76-btns" onClick={event => event.stopPropagation()}>{restricted ? <><button type="button" className="v76-show" onClick={() => onSecureAction(lead, 'reveal')}>{lead._phoneRevealed ? 'Shown' : 'Show no.'}</button><button type="button" className="v76-wa" onClick={() => onSecureAction(lead, 'whatsapp')}>WhatsApp</button><button type="button" className="v76-update" onClick={() => onCall(lead)}>{called ? 'Update' : 'Log call'}</button><button type="button" className="v76-copy" onClick={() => onSecureAction(lead, 'copy')}>Copy</button></> : <>{leadWhatsAppHref(lead) && <a className="v76-wa" href={leadWhatsAppHref(lead)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}<button type="button" className="v76-update" onClick={() => onCall(lead)}>{called ? 'Update' : 'Log call'}</button><button type="button" className="v76-copy" onClick={() => copyPhone(lead, notify)}>Copy</button>{onAssign && <LeadAssignment lead={lead} salesMembers={salesMembers} onAssign={onAssign} />}</>}</div>
  </article>;
}

function LeadCard({ lead, onEdit, onStage, onCall, notify, restricted = false, onSecureAction, salesMembers = [], onAssign, selectionMode = false, selected = false, onSelect }) {
  const stage = normaliseStage(lead.stage);
  const temp = lead.temp || lead.temperature || 'Warm';
  const followDate = lead.follow ? shortDate(lead.follow) : 'No follow-up set';
  const offset = lead.follow ? Math.ceil((new Date(`${lead.follow}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000) : null;
  const followClass = offset == null ? '' : offset < 0 ? 'overdue' : offset === 0 ? 'today' : offset <= 3 ? 'soon' : 'later';
  return (
    <article className={`v17-pipeline-card ${lead.pinned ? 'is-pinned' : ''} ${selectionMode ? 'is-selecting' : ''}`} style={{ '--stage': STAGES.find(([name]) => name === stage)?.[1] || '#111' }} draggable onDragStart={event => event.dataTransfer.setData('text/lead-id', lead.id)} onClick={() => onEdit(lead)}>
      {selectionMode && <label className="lead-bulk-check lead-bulk-check-card" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onSelect(lead.id)} /><span aria-hidden="true" /></label>}
      <div className="v17-card-top"><div className="v17-card-logo">{initials(lead.name || lead.phone)}</div><div className="v17-card-identity"><div className="v69-name-wa-line"><div className="v17-card-name">{lead.name || 'Unnamed lead'}</div><PinBadge lead={lead} /><WhatsAppIcon lead={lead} restricted={restricted} onSecureAction={onSecureAction} /></div><div className={`v17-card-phone ${restricted && !lead._phoneRevealed ? 'is-masked' : ''}`}>{lead.phone || 'No phone'}{lead.city ? ` · ${lead.city}` : ''}</div></div><span className={`v17-temp temp-${String(temp).toLowerCase()}`}>{temp}</span></div>
      <div className="v17-card-service">{lead.service || 'New enquiry'}</div>
      <div className={`v17-card-follow ${followClass}`}><strong>{followDate}</strong><span>{lead.followTime ? `Call at ${lead.followTime}` : lead.company || 'Follow-up schedule not added'}</span></div>
      <div className="v17-card-actions" onClick={event => event.stopPropagation()}>{restricted ? <button type="button" onClick={() => onSecureAction(lead, 'reveal')}>{lead._phoneRevealed ? 'Number shown' : 'Show number'}</button> : <button type="button" onClick={() => downloadAlarm(lead, notify)}>Alarm</button>}<button type="button" className="primary" onClick={() => onCall(lead)}>Log Call</button>{!restricted && onAssign && <LeadAssignment lead={lead} salesMembers={salesMembers} onAssign={onAssign} />}</div>
    </article>
  );
}

function LeadStageRow({ lead, onEdit, onCall, notify, restricted = false, onSecureAction, salesMembers = [], onAssign, selectionMode = false, selected = false, onSelect }) {
  const stage = normaliseStage(lead.stage);
  const temp = lead.temp || lead.temperature || 'Warm';
  const followDate = lead.follow ? shortDate(lead.follow) : 'No follow-up set';
  return <article className={`sales-stage-row ${lead.pinned ? 'is-pinned' : ''}`} style={{ '--stage': STAGES.find(([name]) => name === stage)?.[1] || '#111' }} onClick={() => onEdit(lead)}>
    <div className="sales-stage-person">{selectionMode && <label className="lead-bulk-check" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onSelect(lead.id)} /><span aria-hidden="true" /></label>}<div className="sales-stage-avatar">{initials(lead.name || lead.phone)}</div><div><div className="sales-stage-name"><strong>{lead.name || 'Unnamed lead'}</strong><PinBadge lead={lead} /><WhatsAppIcon lead={lead} restricted={restricted} onSecureAction={onSecureAction} /></div><span className={restricted && !lead._phoneRevealed ? 'is-masked' : ''}>{lead.phone || 'No phone'}{lead.city ? ` · ${lead.city}` : ''}</span></div><em className={`temp-${String(temp).toLowerCase()}`}>{temp}</em></div>
    <div className="sales-stage-requirement"><strong>{lead.service || 'New enquiry'}</strong><span>{lead.businessType || lead.metaBusiness || lead.company || 'Requirement details not added'}</span></div>
    <div className="sales-stage-follow"><strong>{followDate}</strong><span>{lead.followTime ? `Call at ${lead.followTime}` : lead.company || 'Time not scheduled'}</span></div>
    <div className="sales-stage-actions" onClick={event => event.stopPropagation()}>{restricted ? <button type="button" onClick={() => onSecureAction(lead, 'reveal')}>{lead._phoneRevealed ? 'Number shown' : 'Show number'}</button> : <button type="button" onClick={() => downloadAlarm(lead, notify)}>Alarm</button>}<button type="button" className="primary" onClick={() => onCall(lead)}>Log Call</button>{!restricted && onAssign && <LeadAssignment lead={lead} salesMembers={salesMembers} onAssign={onAssign} />}</div>
  </article>;
}

function RequirementPanel({ lead }) {
  const fields = leadRequirementRows(lead);
  const summary = [lead?.service || lead?.metaRequestedService, lead?.businessType || lead?.metaBusiness, lead?.city].filter(Boolean);
  if (!fields.length && !summary.length) return null;
  return <div className="lead-requirements field-wide"><div><strong>Lead requirements</strong><span>{fields.length} useful details</span></div>{summary.length > 0 && <p>{summary.join(' · ')}</p>}<dl>{fields.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}

export function LeadEditor({ lead, data, onClose, onSave, onDelete, onCall, onBilling, notify }) {
  const exists = Boolean(lead?.id);
  const [form, setForm] = useState({ ...BLANK_LEAD, ...(lead || {}), notes: cleanLeadNotes(lead?.notes), temp: lead?.temp || lead?.temperature || 'Warm' });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const pinnedCount = data.leads.filter(item => item.pinned && item.id !== lead?.id).length;
  function prepared() {
    return { ...form, id: form.id || uid('lead'), name: form.name.trim(), company: form.company.trim(), phone: form.phone.trim(), email: form.email.trim(), city: form.city.trim(), department: leadDepartment(form), quote: Number(form.quote || 0), deal: Number(form.deal || 0), advance: Number(form.advance || 0), paid: Number(form.paid || 0), stage: normaliseStage(form.stage), callStatus: form.callStatus || 'not_called', callAttempts: Number(form.callAttempts || 0), callHistory: Array.isArray(form.callHistory) ? form.callHistory : [], source: form.source || 'Manual', pinLabel: form.pinned ? form.pinLabel || PIN_LABELS[0] : '', createdAt: form.createdAt || new Date().toISOString(), lastUpdatedAt: new Date().toISOString() };
  }
  function valid() {
    if (!form.phone.trim()) { notify('Phone number is required'); return false; }
    if (form.pinned && !lead?.pinned && pinnedCount >= MAX_PINNED) { notify(`Maximum ${MAX_PINNED} pinned clients`); return false; }
    return true;
  }
  function submit(event) { event?.preventDefault(); if (valid()) onSave(prepared()); }
  async function saveAnd(action) {
    if (!valid()) return;
    const saved = prepared();
    if (action === 'billing') {
      const pendingSave = onSave(saved, { keepOpen: true });
      onBilling(saved);
      await pendingSave;
      return;
    }
    const ok = await onSave(saved, { keepOpen: true });
    if (!ok) return;
    if (action === 'call') onCall(saved);
    if (action === 'billing') onBilling(saved);
    if (action === 'alarm') downloadAlarm(saved, notify);
  }
  const received = Number(form.advance || 0) + Number(form.paid || 0);
  const due = Math.max(0, Number(form.deal || 0) - received);
  return (
    <Modal title={exists ? 'Edit lead' : 'Add lead'} subtitle="Contact, requirement, follow-up, quotation and collection" onClose={onClose} wide footer={<><div>{exists && <Button variant="danger" onClick={() => onDelete(lead)}>Delete lead</Button>}</div><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save lead</Button></div></>}>
      {exists && <div className="lead-editor-actions"><Button onClick={() => saveAnd('call')}>Log Call</Button><a className="button" href={leadWhatsAppHref(form) || undefined} target="_blank" rel="noopener noreferrer" onClick={event => { if (!leadWhatsAppHref(form)) { event.preventDefault(); notify('WhatsApp number missing'); } }}>WhatsApp</a><Button onClick={() => saveAnd('billing')}>Quote / Bill</Button><Button onClick={() => saveAnd('alarm')}>Download Alarm File</Button></div>}
      <form className="form form-grid" onSubmit={submit}>
        <Field label="Contact name"><input value={form.name} onChange={event => set('name', event.target.value)} autoFocus /></Field><Field label="Business / company"><input value={form.company} onChange={event => set('company', event.target.value)} /></Field>
        <Field label="Phone number *"><input inputMode="tel" value={form.phone} onChange={event => set('phone', event.target.value)} /></Field><Field label="Email"><input type="email" value={form.email} onChange={event => set('email', event.target.value)} /></Field>
        <Field label="City"><input value={form.city} onChange={event => set('city', event.target.value)} /></Field><Field label="Service"><select value={form.service} onChange={event => set('service', event.target.value)}>{SERVICES.map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Current stage"><select value={form.stage} onChange={event => set('stage', event.target.value)}>{STAGES.map(([name]) => <option key={name}>{name}</option>)}</select></Field><Field label="Temperature"><select value={form.temp} onChange={event => set('temp', event.target.value)}><option>Hot</option><option>Warm</option><option>Cold</option></select></Field>
        <Field label="Important client" wide><div className="pin-controls"><label><input type="checkbox" checked={Boolean(form.pinned)} onChange={event => set('pinned', event.target.checked)} /> Pin this client</label><select value={form.pinLabel || PIN_LABELS[0]} disabled={!form.pinned} onChange={event => set('pinLabel', event.target.value)}>{PIN_LABELS.map(item => <option key={item}>{item}</option>)}</select><span>{pinnedCount + (form.pinned ? 1 : 0)} / {MAX_PINNED} pinned</span></div></Field>
        <Field label="Expected delivery"><input type="date" value={form.delivery} onChange={event => set('delivery', event.target.value)} /></Field><Field label="Follow-up"><div className="field-pair"><input type="date" value={form.follow} onChange={event => set('follow', event.target.value)} /><input type="time" value={form.followTime} onChange={event => set('followTime', event.target.value)} /></div></Field>
        <div className="follow-quick field-wide"><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 1); setForm(current => ({ ...current, follow: date.toISOString().slice(0, 10), followTime: '11:00' })); }}>Tomorrow 11 AM</button><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 1); setForm(current => ({ ...current, follow: date.toISOString().slice(0, 10), followTime: '16:00' })); }}>Tomorrow 4 PM</button><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); setForm(current => ({ ...current, follow: date.toISOString().slice(0, 10), followTime: '11:00' })); }}>After 1 week</button><button type="button" onClick={() => setForm(current => ({ ...current, follow: '', followTime: '' }))}>Clear</button></div>
        <RequirementPanel lead={form} />
        <div className="form-section field-wide">Quotation and payment</div>
        <Field label="Quotation amount (₹)"><input type="number" min="0" value={form.quote} onChange={event => set('quote', event.target.value)} /></Field><Field label="Final agreed deal (₹)"><input type="number" min="0" value={form.deal} onChange={event => set('deal', event.target.value)} /></Field>
        <Field label="Advance received (₹)"><input type="number" min="0" value={form.advance} onChange={event => set('advance', event.target.value)} /></Field><Field label="Other payments (₹)"><input type="number" min="0" value={form.paid} onChange={event => set('paid', event.target.value)} /></Field>
        <div className="lead-money-preview field-wide"><div><span>Final deal</span><b>{money(form.deal)}</b></div><div><span>Total received</span><b>{money(received)}</b></div><div><span>Balance due</span><b>{money(due)}</b></div></div>
        <div className="form-section field-wide">Collection schedule</div>
        <Field label="Collection due date"><input type="date" value={form.collectionDate} onChange={event => set('collectionDate', event.target.value)} /></Field><Field label="Collection time"><input type="time" value={form.collectionTime} onChange={event => set('collectionTime', event.target.value)} /></Field>
        <Field label="Recovery owner"><select value={form.collectionOwner} onChange={event => set('collectionOwner', event.target.value)}><option value="">Founder / Admin</option>{data.team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Collection priority"><select value={form.collectionPriority} onChange={event => set('collectionPriority', event.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></Field>
        <Field label="Collection note / promise to pay" wide><input value={form.collectionNote} onChange={event => set('collectionNote', event.target.value)} /></Field><Field label="Notes / next action" wide><textarea value={form.notes} onChange={event => set('notes', event.target.value)} rows="4" /></Field>
      </form>
    </Modal>
  );
}

export function SalesLeadViewer({ lead, onClose, onPhoneAction, onCall }) {
  const [current, setCurrent] = useState(lead);
  useEffect(() => setCurrent(lead), [lead]);
  const requirements = leadRequirementRows(current);
  async function phoneAction(action) {
    const revealed = await onPhoneAction(current, action);
    if (revealed) setCurrent(revealed);
  }
  return <Modal title={current.name || 'Assigned lead'} subtitle="Secure sales view · every number access is logged" onClose={onClose} wide footer={<><span className="sales-secure-note">Only Admin-assigned information is available.</span><Button onClick={onClose}>Close</Button></>}><div className="sales-lead-view"><div className="sales-lead-primary"><div><span>Phone</span><strong className={!current._phoneRevealed ? 'masked' : ''}>{current.phone || 'Not available'}</strong></div><div className="sales-lead-actions"><button type="button" onClick={() => phoneAction('reveal')}>{current._phoneRevealed ? 'Number shown' : 'Show number'}</button><button type="button" onClick={() => phoneAction('copy')}>Copy</button><button type="button" onClick={() => phoneAction('whatsapp')}>WhatsApp</button><button className="primary" type="button" onClick={() => onCall(current)}>Log call</button></div></div><dl className="sales-lead-facts"><div><dt>Company</dt><dd>{current.company || '—'}</dd></div><div><dt>City</dt><dd>{current.city || '—'}</dd></div><div><dt>Service</dt><dd>{current.service || '—'}</dd></div><div><dt>Stage</dt><dd>{normaliseStage(current.stage)}</dd></div><div><dt>Follow-up</dt><dd>{current.follow ? `${shortDate(current.follow)} ${current.followTime || ''}` : 'Not set'}</dd></div><div><dt>Temperature</dt><dd>{current.temp || current.temperature || 'Warm'}</dd></div></dl>{requirements.length > 0 && <section><h3>Requirement details</h3><dl className="sales-requirements">{requirements.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}{current.notes && <section><h3>Notes</h3><p>{current.notes}</p></section>}</div></Modal>;
}

export function CallEditor({ lead, onClose, onSave }) {
  const [picked, setPicked] = useState('picked');
  const [status, setStatus] = useState('connected');
  const [follow, setFollow] = useState(lead.follow || '');
  const [followTime, setFollowTime] = useState(lead.followTime || '11:00');
  const [note, setNote] = useState('');
  const options = picked === 'picked' ? [['connected', 'Connected'], ['thinking', 'Thinking'], ['interested_week', 'Interested · one week'], ['proposal_sent', 'Proposal sent'], ['converted', 'Converted'], ['not_interested', 'Not interested']] : [['no_answer', 'No answer'], ['busy', 'Busy'], ['wrong_number', 'Wrong number']];
  const needsNext = ['thinking', 'interested_week', 'proposal_sent'].includes(status);
  return (
    <Modal title={`Call outcome · ${lead.name || lead.phone}`} subtitle={lead.phone} onClose={onClose} footer={<><span /><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={needsNext && (!follow || !followTime)} onClick={() => onSave({ leadId: lead.id, picked, status, follow: needsNext ? follow : '', followTime: needsNext ? followTime : '', note, eventId: uid('call') })}>Save outcome</Button></div></>}>
      <div className="segmented"><button type="button" className={picked === 'picked' ? 'active' : ''} onClick={() => { setPicked('picked'); setStatus('connected'); }}>Picked</button><button type="button" className={picked === 'not_picked' ? 'active' : ''} onClick={() => { setPicked('not_picked'); setStatus('no_answer'); }}>Not picked</button></div>
      <div className="outcome-grid">{options.map(([value, label]) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}</div>
      <div className="form form-grid">{needsNext && <><Field label="Next follow-up"><input type="date" min={today()} value={follow} onChange={event => setFollow(event.target.value)} /></Field><Field label="Reminder time"><input type="time" value={followTime} onChange={event => setFollowTime(event.target.value)} /></Field></>}<Field label="Short call note" wide><textarea rows="4" value={note} onChange={event => setNote(event.target.value)} /></Field></div>
      {(lead.callHistory || []).length > 0 && <div className="call-history"><strong>Recent calls</strong>{lead.callHistory.slice(0, 5).map(item => <div key={item.id || item.at}><span>{String(item.status || '').replaceAll('_', ' ')}</span><small>{item.at ? new Date(item.at).toLocaleString('en-IN') : ''}{item.note ? ` · ${item.note}` : ''}</small></div>)}</div>}
    </Modal>
  );
}

export function ImportedLeadManager({ data, onClose, onDelete, onUndo }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const imported = data.leads.filter(lead => lead.imported || lead.metaLeadId || /csv|meta/i.test(String(lead.source || lead.importSource || '')));
  const visible = imported.filter(lead => !query || [lead.name, lead.phone, lead.service, lead.metaForm, lead.importFileName].join(' ').toLowerCase().includes(query.toLowerCase()));
  const allVisible = visible.length > 0 && visible.every(lead => selected.includes(lead.id));
  return <Modal title="Manage imported leads" subtitle={`${imported.length} imported · ${selected.length} selected`} onClose={onClose} wide footer={<><Button disabled={!data.leadTrash?.length} onClick={onUndo}>↶ Undo last delete</Button><div><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!selected.length} onClick={() => onDelete(selected)}>Delete selected</Button></div></>}>
    <Search value={query} onChange={setQuery} placeholder="Search imported leads" />
    <label className="import-select-all"><input type="checkbox" checked={allVisible} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...visible.map(lead => lead.id)])] : selected.filter(id => !visible.some(lead => lead.id === id)))} /> Select all visible</label>
    <div className="import-manager-list">{visible.length ? visible.map(lead => <label key={lead.id}><input type="checkbox" checked={selected.includes(lead.id)} onChange={event => setSelected(current => event.target.checked ? [...current, lead.id] : current.filter(id => id !== lead.id))} /><span><b>{lead.name || lead.phone || 'Unnamed lead'}</b><small>{lead.phone || 'No phone'} · {lead.service || 'Service not set'}</small></span><span><b>{lead.importFileName || lead.metaForm || lead.source || 'Imported'}</b><small>{isCalled(lead) ? 'Called' : 'Not called'}</small></span></label>) : <Empty>No imported leads match.</Empty>}</div>
  </Modal>;
}

const CSV_DETAIL_LIMIT = 30;

function csvLeadFieldCount(lead) {
  const formFieldCount = (Array.isArray(lead?.formFields) ? lead.formFields : []).filter(field => String(field?.displayValue ?? field?.value ?? '').trim()).length;
  if (formFieldCount) return formFieldCount;
  return ['businessType', 'profilePages', 'profileBudget', 'contentReadiness', 'websiteBudget', 'serverRequirement', 'notes'].filter(key => String(lead?.[key] || '').trim()).length;
}

function csvPreviewDetails(preview, classification, leads) {
  const diagnostics = (Array.isArray(preview?.diagnostics) ? preview.diagnostics : []).filter(item => item?.classification === classification);
  return (Array.isArray(leads) ? leads : []).slice(0, CSV_DETAIL_LIMIT).map((lead, index) => {
    const diagnostic = diagnostics[index] || {};
    return {
      lead: lead && typeof lead === 'object' ? lead : {},
      diagnostic,
      row: Number.isInteger(diagnostic.index) ? diagnostic.index + 2 : index + 2,
    };
  });
}

function CsvImportDetailGroup({ preview, classification, title, leads }) {
  const total = Array.isArray(leads) ? leads.length : 0;
  if (!total) return null;
  const items = csvPreviewDetails(preview, classification, leads);
  return <details className={`csv-import-detail is-${classification}`}><summary><span>{title}</span><b>{total}</b></summary><div className="csv-import-detail-list">{items.map(({ lead, diagnostic, row }, index) => {
    const matchDetails = [diagnostic.matchedBy ? `Matched by ${String(diagnostic.matchedBy).replaceAll('_', ' ')}` : '', Number(diagnostic.matchCount || 0) > 1 ? `${diagnostic.matchCount} possible matches` : ''].filter(Boolean).join(' · ');
    const detail = diagnostic.reason || matchDetails;
    const fieldCount = csvLeadFieldCount(lead);
    return <div className="csv-import-detail-row" key={`${classification}-${row}-${lead.id || index}`} title={detail}><span className="csv-import-row-number">Row {row}</span><strong>{lead.name || lead.company || 'Unnamed row'}</strong><span className="csv-import-row-phone">{lead.phone || 'No phone'}</span><span className="csv-import-row-fields">{fieldCount} field{fieldCount === 1 ? '' : 's'}</span></div>;
  })}{total > CSV_DETAIL_LIMIT && <p>Showing the first {CSV_DETAIL_LIMIT} of {total} rows.</p>}</div></details>;
}

export function CsvImportPreview({ preview, result = null, busy = false, activeMode = '', onClose, onCommit }) {
  if (result) {
    const completed = result.status === 'success';
    const resultCounts = [
      ['Added', Number(result.added || 0), 'new'],
      ['Updated', Number(result.replaced || 0), 'existing'],
      ['Existing skipped', Number(result.skippedExisting || 0), 'total'],
      ['Invalid', Number(result.invalid || 0), 'invalid'],
      ['Repeated', Number(result.repeated || 0), 'repeated'],
      ['Ambiguous', Number(result.ambiguous || 0), 'ambiguous'],
    ];
    return <Modal title={completed ? 'Import complete' : 'CSV import stopped'} subtitle={result.fileName || 'CSV file'} onClose={onClose} wide footer={<><span /><Button variant="primary" onClick={onClose}>Close</Button></>}>
      <div className={`csv-import-result ${completed ? 'is-success' : 'is-error'}`}>
        <div className="csv-import-result-message" role={completed ? 'status' : 'alert'}><strong>{completed ? 'Your lead import is complete.' : Number(result.added || 0) + Number(result.replaced || 0) > 0 ? 'The import stopped after saving some leads.' : 'The import could not be completed.'}</strong><span>{completed ? 'The lead list is refreshed and its filters have been reset.' : 'This analysis can no longer be submitted. Select the CSV again to reanalyse it before trying another import.'}</span></div>
        <div className="csv-import-counts" aria-label="CSV import result">{resultCounts.map(([label, value, tone]) => <div className={`csv-import-count is-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        {!completed && <p className="csv-import-result-error">{result.error || 'The server could not finish this import.'}</p>}
      </div>
    </Modal>;
  }
  const total = Number(preview?.totalRows || 0);
  const newCount = Number(preview?.newCount ?? preview?.newLeads?.length ?? 0);
  const existingCount = Number(preview?.existingCount ?? preview?.existingLeads?.length ?? 0);
  const repeatedCount = Number(preview?.repeatedCount ?? preview?.repeatedLeads?.length ?? 0);
  const invalidCount = Number(preview?.invalidCount ?? preview?.invalidLeads?.length ?? 0);
  const ambiguousCount = Number(preview?.ambiguousCount ?? preview?.ambiguousLeads?.length ?? 0);
  const importableCount = newCount + existingCount;
  const close = busy ? () => undefined : onClose;
  const counts = [
    ['Total rows', total, 'total'],
    ['New leads', newCount, 'new'],
    ['Existing leads', existingCount, 'existing'],
    ['Repeated rows', repeatedCount, 'repeated'],
    ['Invalid rows', invalidCount, 'invalid'],
    ['Ambiguous matches', ambiguousCount, 'ambiguous'],
  ];
  return <Modal title="Review CSV import" subtitle={preview?.fileName || 'CSV file'} onClose={close} wide footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><div className="csv-import-actions"><Button disabled={busy || !newCount} onClick={() => onCommit('skip')}>{busy && activeMode === 'skip' ? 'Adding leads…' : 'Add new leads only'}</Button><Button variant="primary" disabled={busy || !importableCount} onClick={() => onCommit('replace')}>{busy && activeMode === 'replace' ? 'Saving leads…' : 'Add new + update existing'}</Button></div></>}>
    <div className="csv-import-preview">
      <div className="csv-import-unchanged" role="status"><strong>Nothing has changed yet.</strong><span>Choose an import option below only after reviewing these results.</span></div>
      <div className="csv-import-counts" aria-label="CSV import analysis">{counts.map(([label, value, tone]) => <div className={`csv-import-count is-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="csv-import-guidance">
        <section><strong>Add new leads only</strong><p>Adds the {newCount} new lead{newCount === 1 ? '' : 's'} and leaves all {existingCount} existing lead{existingCount === 1 ? '' : 's'} unchanged.</p></section>
        <section><strong>Add new + update existing</strong><p>Adds new leads and refreshes imported details for existing matches. Lead history, follow-ups, and payments are preserved.</p></section>
      </div>
      {(repeatedCount > 0 || invalidCount > 0 || ambiguousCount > 0) && <p className="csv-import-exclusions">Repeated, invalid, and ambiguous rows will not be imported. Ambiguous rows are skipped so the wrong lead is never updated.</p>}
      <div className="csv-import-details">
        <CsvImportDetailGroup preview={preview} classification="existing" title="Existing lead matches" leads={preview?.existingLeads} />
        <CsvImportDetailGroup preview={preview} classification="repeated" title="Repeated rows in this CSV" leads={preview?.repeatedLeads} />
        <CsvImportDetailGroup preview={preview} classification="ambiguous" title="Ambiguous matches · excluded" leads={preview?.ambiguousLeads} />
        <CsvImportDetailGroup preview={preview} classification="invalid" title="Invalid rows · excluded" leads={preview?.invalidLeads} />
      </div>
    </div>
  </Modal>;
}

export default function Sales({ data, onEdit, onCall, onStage, onMark, onImport, importCompletion = 0, onUndoImported, onDeleteDuplicates, notify, openNew, openImportManager, restricted = false, canAssign = false, onAssign, onAssignMany, onSecureAction }) {
  const [query, setQuery] = useState('');
  const [service, setService] = useState('');
  const [temperature, setTemperature] = useState('');
  const [queueFilter, setQueueFilter] = useState(() => typeof window === 'undefined' ? 'all' : localStorage.getItem('visitinglink_sales_rail_filter') || 'all');
  const [department, setDepartment] = useState(() => typeof window === 'undefined' ? 'all' : localStorage.getItem('visitinglink_lead_dept_filter') || 'all');
  const [selectedStage, setSelectedStage] = useState('Follow-up');
  const [viewMode, setViewMode] = useState('queue');
  const [folded, setFolded] = useState({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [shareMemberId, setShareMemberId] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInput = useRef(null);
  const handledImportCompletion = useRef(importCompletion);
  const leads = useMemo(() => data.leads.filter(lead => {
    const formFields = (Array.isArray(lead.formFields) ? lead.formFields : []).flatMap(item => [item?.key, item?.label, item?.displayValue ?? item?.value]).join(' ');
    const metaFields = (Array.isArray(lead.metaAllFields) ? lead.metaAllFields : []).flatMap(item => [item?.key, item?.label, item?.displayValue ?? item?.value]).join(' ');
    const metaAnswers = Object.entries(lead.metaAnswers || {}).flat().join(' ');
    const hay = [lead.name, lead.company, lead.phone, lead.city, lead.service, lead.metaForm, lead.metaRequestedService, lead.metaBudget, lead.serverRequirement, formFields, metaFields, metaAnswers].join(' ').toLowerCase();
    const queryDigits = digits(query);
    return !lead._v47PipelineRemoved && (!query || hay.includes(query.toLowerCase()) || (queryDigits && digits(lead.phone).includes(queryDigits))) && (!service || lead.service === service) && (!temperature || (lead.temp || lead.temperature) === temperature);
  }), [data.leads, query, service, temperature]);
  const departmentLeads = leads.filter(lead => department === 'all' || leadDepartment(lead) === department);
  const queue = departmentLeads.filter(lead => queueFilter === 'pending' ? needsCall(lead) : queueFilter === 'followup' ? needsFollowup(lead) : queueFilter === 'pinned' ? lead.pinned : true).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (queueFilter === 'followup' ? String(a.follow || '').localeCompare(String(b.follow || '')) : stamp(b) - stamp(a)));
  const stageLeads = departmentLeads.filter(lead => normaliseStage(lead.stage) === selectedStage).sort((a, b) => String(a.follow || '9999').localeCompare(String(b.follow || '9999')) || stamp(b) - stamp(a));
  const counts = { all: departmentLeads.length, pending: departmentLeads.filter(needsCall).length, followup: departmentLeads.filter(needsFollowup).length, pinned: departmentLeads.filter(lead => lead.pinned).length };
  const departmentCounts = { all: leads.length, profile: leads.filter(lead => leadDepartment(lead) === 'profile').length, website: leads.filter(lead => leadDepartment(lead) === 'website').length };
  const salesMembers = canAssign ? data.team.filter(member => member.active !== false && member.accessRole === 'sales') : [];
  const assignmentHandler = canAssign ? onAssign : null;
  const groups = useMemo(() => {
    const source = queueFilter === 'all' ? queue.filter(lead => !lead.pinned) : queue;
    const byDay = new Map();
    source.forEach(lead => { const key = dayKey(lead); byDay.set(key, [...(byDay.get(key) || []), lead]); });
    return [...byDay.entries()].sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a));
  }, [queue, queueFilter]);

  useEffect(() => { localStorage.setItem('visitinglink_sales_rail_filter', queueFilter); }, [queueFilter]);
  useEffect(() => { localStorage.setItem('visitinglink_lead_dept_filter', department); }, [department]);
  useEffect(() => {
    if (handledImportCompletion.current === importCompletion) return;
    handledImportCompletion.current = importCompletion;
    setQuery('');
    setService('');
    setTemperature('');
    setDepartment('all');
    setQueueFilter('all');
    setViewMode('queue');
  }, [importCompletion]);
  useEffect(() => {
    const undo = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !event.target.matches?.('input,textarea,select') && data.leadTrash?.length) { event.preventDefault(); onUndoImported(); } };
    window.addEventListener('keydown', undo);
    return () => window.removeEventListener('keydown', undo);
  }, [data.leadTrash, onUndoImported]);

  async function readCsv(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('CSV is larger than 20 MB. Split it into smaller files and try again.');
      const bytes = await file.arrayBuffer();
      const text = decodeCsvBytes(bytes);
      const { records, columns } = parseCsvDocument(text);
      const now = Date.now();
      const incoming = records
        .map((record, index) => csvRecordToLead(record, { fileName: file.name, index, now, columns }))
        .map(lead => ({ ...lead, department: leadDepartment(lead) }));
      await onImport(incoming, file.name);
    } catch (error) {
      notify(error?.message || 'CSV could not be imported');
    } finally {
      input.value = '';
      setImporting(false);
    }
  }

  function setDrop(event, stage) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/lead-id');
    const lead = data.leads.find(item => item.id === id);
    if (lead) onStage(lead, stage);
  }

  function showQueue(nextFilter) {
    setQueueFilter(nextFilter);
    setViewMode('queue');
  }

  function showStage(stage) {
    setSelectedStage(stage);
    setViewMode('stage');
  }

  function toggleSelected(leadId) {
    setSelectedLeadIds(current => current.includes(leadId) ? current.filter(id => id !== leadId) : [...current, leadId]);
  }

  function toggleVisibleSelection() {
    const visibleIds = departmentLeads.map(lead => lead.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedLeadIds.includes(id));
    setSelectedLeadIds(current => allSelected ? current.filter(id => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  }

  async function shareSelected() {
    if (!selectedLeadIds.length || !shareMemberId || !onAssignMany) return;
    const leadIds = [...selectedLeadIds];
    const selectedMemberId = shareMemberId;
    const memberId = shareMemberId === '__unassign__' ? '' : shareMemberId;
    setSelectedLeadIds([]);
    setShareMemberId('');
    setSelectionMode(false);
    const ok = await onAssignMany(leadIds, memberId);
    if (!ok) { setSelectedLeadIds(leadIds); setShareMemberId(selectedMemberId); setSelectionMode(true); }
  }

  let running = 0;
  return (
    <section className={`page active v66-mode-${viewMode}`} id="sales">
      <div className="softwarebar classicbar"><div className="classicpagetitle">{restricted ? 'My Assigned Leads' : 'Leads'}</div><div className="actions">
        {restricted ? <div className="sales-secure-chip"><span>●</span> Protected access · {data.leads.length} assigned</div> : <><input ref={fileInput} type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" hidden onChange={readCsv} /><button className="btn" type="button" disabled={importing} onClick={() => { if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); } }}>{importing ? 'Importing…' : 'Import CSV'}</button><button className="btn" type="button" onClick={openImportManager}>Select / Delete Imported</button><button className="btn" type="button" onClick={onDeleteDuplicates} title="Delete extra leads with the same phone number">Delete duplicates</button><button className="btn v23-undo-button" type="button" disabled={!data.leadTrash?.length} onClick={onUndoImported}>↶ Undo delete</button><button className="btn" type="button" onClick={() => downloadCsv(`visitinglink-leads-${today()}.csv`, [['Name', 'Phone', 'Email', 'City', 'Service', 'Stage', 'Follow-up'], ...data.leads.map(lead => [lead.name, lead.phone, lead.email, lead.city, lead.service, normaliseStage(lead.stage), lead.follow])])}>Export</button><button className="btn dark" type="button" onClick={openNew}>Add lead</button></>}
        <button className="btn" type="button" onClick={() => showStage('Archived')}>Archived</button>
      </div></div>
      <div id="v66Tabs" role="tablist" aria-label="Lead queues and pipeline stages">
        {[['all', 'All'], ['pending', 'To call'], ['followup', 'Follow-up']].map(([value, label]) => <button type="button" key={value} className={`v66-tab ${viewMode === 'queue' && queueFilter === value ? 'active' : ''}`} onClick={() => showQueue(value)}><span>{label}</span><b>{counts[value]}</b></button>)}
        <span className="v66-divider" aria-hidden="true" />
        {STAGES.filter(([stage]) => !['New Lead', 'Archived'].includes(stage)).map(([stage]) => {
          const count = departmentLeads.filter(lead => normaliseStage(lead.stage) === stage).length;
          const label = stage === 'Contacted' ? 'Follow-up 1' : stage === 'Follow-up' ? 'Follow-up 2' : stage === 'Converted / Payment Done' ? 'Converted' : stage;
          return <button type="button" key={stage} className={`v66-tab ${viewMode === 'stage' && selectedStage === stage ? 'active' : ''}`} onClick={() => showStage(stage)} onDragOver={event => event.preventDefault()} onDrop={event => setDrop(event, stage)}><span>{label}</span><b>{count}</b></button>;
        })}
      </div>
      <div className="classicfilters"><div className="search classicsearch"><input inputMode="tel" placeholder="Search phone, name, city or requirement" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} /></div><select className="filter" value={service} onChange={event => setService(event.target.value)}><option value="">All services</option>{SERVICES.map(item => <option key={item}>{item}</option>)}</select><select className="filter" value={temperature} onChange={event => setTemperature(event.target.value)}><option value="">All temperatures</option><option>Hot</option><option>Warm</option><option>Cold</option></select></div>
      {canAssign && <div className={`sales-bulk-assign ${selectionMode ? 'active' : ''}`}><button type="button" className="sales-select-toggle" onClick={() => { setSelectionMode(current => !current); setSelectedLeadIds([]); setShareMemberId(''); }}>{selectionMode ? 'Cancel mass assign' : 'Mass assign leads'}</button>{selectionMode && <><button type="button" className="sales-select-visible" onClick={toggleVisibleSelection}>Select visible</button><strong>{selectedLeadIds.length} selected</strong><select value={shareMemberId} onChange={event => setShareMemberId(event.target.value)} aria-label="Share selected leads with"><option value="">Share with sales person…</option>{salesMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}<option value="__unassign__">Remove assignment</option></select><button type="button" className="sales-share-selected" disabled={!selectedLeadIds.length || !shareMemberId} onClick={shareSelected}>Share selected</button></>}</div>}
      <div className="classicworkspace">
        <aside className="classicrail" onDragOver={event => event.preventDefault()} onDrop={event => setDrop(event, 'New Lead')}>
          <div className="classicrailhead"><div><strong>Leads</strong><span>Today pehle · date-wise</span></div><b>{queue.length}</b></div>
          <div className="classicstats-compact v36-lead-summary" aria-label="Lead summary"><div className="v36-lead-summary-main"><strong>{departmentLeads.length} leads</strong><span>All · To call · Follow-up</span></div><button className="v36-info-btn" type="button" aria-label="View lead counts" title="View lead counts">i</button><div className="v36-hidden-metrics" aria-hidden="true"><strong>{counts.pending}</strong><strong>{counts.followup}</strong></div></div>
          <div className="classicrailfilters">{[['all', 'All'], ['pending', 'To call'], ['followup', 'Follow-up'], ['pinned', 'Pinned']].map(([value, label]) => <button type="button" key={value} className={`classicrailbtn ${queueFilter === value ? 'active' : ''}`} onClick={() => setQueueFilter(value)}>{label} · {counts[value]}</button>)}</div>
          <div className="vl-dept-filters" role="tablist" aria-label="Lead departments"><button type="button" className={`vl-dept-btn ${department === 'all' ? 'active' : ''}`} onClick={() => setDepartment('all')}>All forms · {departmentCounts.all}</button><button type="button" className={`vl-dept-btn ${department === 'profile' ? 'active' : ''}`} onClick={() => setDepartment('profile')}>Company Profile · {departmentCounts.profile}</button><button type="button" className={`vl-dept-btn ${department === 'website' ? 'active' : ''}`} onClick={() => setDepartment('website')}>Website Design · {departmentCounts.website}</button></div>
          <div className="classicleadlist" id="leadInboxList">
            {queueFilter === 'all' && queue.some(lead => lead.pinned) && <section className="vl-pinned-section"><header className="vl-pinned-head"><strong>Pinned clients</strong><b>{queue.filter(lead => lead.pinned).length} / {MAX_PINNED}</b></header><div className="vl-pinned-list">{queue.filter(lead => lead.pinned).map(lead => <LeadQueueRow key={`pin-${lead.id}`} lead={lead} index={++running} onEdit={onEdit} onCall={onCall} onMark={onMark} notify={notify} restricted={restricted} onSecureAction={onSecureAction} salesMembers={salesMembers} onAssign={assignmentHandler} selectionMode={selectionMode} selected={selectedLeadIds.includes(lead.id)} onSelect={toggleSelected} />)}</div></section>}
            {groups.map(([key, items]) => {
              const collapsed = folded[key] === true;
              const profile = items.filter(lead => leadDepartment(lead) === 'profile');
              const website = items.filter(lead => leadDepartment(lead) === 'website');
              return <section className="vl-day-block" key={key}><button type="button" className="vl-day-head" onClick={() => setFolded(current => ({ ...current, [key]: !current[key] }))}><span><strong>{dayLabel(key)}</strong><small>{items.length} leads · {profile.length ? `Profile ${profile.length}` : ''}{profile.length && website.length ? ' · ' : ''}{website.length ? `Website ${website.length}` : ''}</small></span><b>{collapsed ? 'Show' : 'Hide'}</b></button>{!collapsed && <div className="vl-day-list">{department === 'all' ? <>{profile.length > 0 && <section className="vl-dept-section"><header className="vl-dept-head profile"><span>Company Profile</span><b>{profile.length}</b></header>{profile.map(lead => <LeadQueueRow key={lead.id} lead={lead} index={++running} onEdit={onEdit} onCall={onCall} onMark={onMark} notify={notify} restricted={restricted} onSecureAction={onSecureAction} salesMembers={salesMembers} onAssign={assignmentHandler} selectionMode={selectionMode} selected={selectedLeadIds.includes(lead.id)} onSelect={toggleSelected} />)}</section>}{website.length > 0 && <section className="vl-dept-section"><header className="vl-dept-head website"><span>Website Design</span><b>{website.length}</b></header>{website.map(lead => <LeadQueueRow key={lead.id} lead={lead} index={++running} onEdit={onEdit} onCall={onCall} onMark={onMark} notify={notify} restricted={restricted} onSecureAction={onSecureAction} salesMembers={salesMembers} onAssign={assignmentHandler} selectionMode={selectionMode} selected={selectedLeadIds.includes(lead.id)} onSelect={toggleSelected} />)}</section>}</> : items.map(lead => <LeadQueueRow key={lead.id} lead={lead} index={++running} onEdit={onEdit} onCall={onCall} onMark={onMark} notify={notify} restricted={restricted} onSecureAction={onSecureAction} salesMembers={salesMembers} onAssign={assignmentHandler} selectionMode={selectionMode} selected={selectedLeadIds.includes(lead.id)} onSelect={toggleSelected} />)}</div>}</section>;
            })}
            {!queue.length && <Empty>{queueFilter === 'pinned' ? 'No pinned clients yet.' : queueFilter === 'followup' ? 'No follow-up leads.' : 'No leads in this queue.'}</Empty>}
          </div>
        </aside>
        <main className="classicboard apple-pipeline-board" id="pipelineBoard">
          <div className="apple-pipeline-grid v23-selected-board">
            <div className="v23-stage-tabs">{STAGES.filter(([stage]) => stage !== 'New Lead').map(([stage, color]) => { const count = departmentLeads.filter(lead => normaliseStage(lead.stage) === stage).length; return <button type="button" key={stage} className={`v23-stage-tab ${selectedStage === stage ? 'active' : ''}`} onClick={() => showStage(stage)} onDragOver={event => event.preventDefault()} onDrop={event => setDrop(event, stage)} style={{ '--stage': color }}><span>{stage === 'Contacted' ? 'Follow-up 1' : stage === 'Follow-up' ? 'Follow-up 2' : stage === 'Converted / Payment Done' ? 'Converted' : stage}</span><b>{count}</b></button>; })}</div>
            <div className="v23-selected-heading"><div><span>Selected stage</span><strong>{selectedStage === 'Contacted' ? 'Follow-up stage 1' : selectedStage === 'Follow-up' ? 'Follow-up stage 2' : selectedStage === 'Converted / Payment Done' ? 'Converted' : selectedStage}</strong></div><b>{stageLeads.length} leads</b></div>
            {stageLeads.length > 0 && <div className="v23-stage-list-head" aria-hidden="true"><span>Lead</span><span>Requirement</span><span>Follow-up</span><span>Actions</span></div>}
            <div className="sales-stage-list" onDragOver={event => event.preventDefault()} onDrop={event => setDrop(event, selectedStage)}>{stageLeads.length ? stageLeads.map(lead => <LeadStageRow key={lead.id} lead={lead} onEdit={onEdit} onCall={onCall} notify={notify} restricted={restricted} onSecureAction={onSecureAction} salesMembers={salesMembers} onAssign={assignmentHandler} selectionMode={selectionMode} selected={selectedLeadIds.includes(lead.id)} onSelect={toggleSelected} />) : <div className="v23-stage-empty"><strong>No leads in this stage.</strong><span>Drag a lead here or choose another stage.</span></div>}</div>
          </div>
        </main>
      </div>
    </section>
  );
}
