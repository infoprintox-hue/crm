import assert from 'node:assert/strict';
import { analyseLeadImport, phoneIdentityKey } from '../lib/client/business.js';
import {
  importLeadBatch,
  normalizeImportedPhone,
  safeImportedLead,
  sanitizeImportedFormFields,
  stateForRole,
} from '../lib/server/state.js';

const importOptions = {
  fileName: 'server-import.csv',
  importId: 'import-server-test',
  importedAt: '2026-10-08T00:00:00.000Z',
  now: Date.parse('2026-10-08T00:00:00.000Z'),
};

// Preview and commit must use identical identity rules and priority.
const existingForCounts = [
  { id: 'stored-a', externalLeadId: 'external-a', phone: '9876543210', email: 'a@example.com' },
  { id: 'stored-b', phone: '9123456789', email: 'b@example.com' },
  { id: 'stored-c', phone: '9000000000' },
  { id: 'stored-d', phone: '+91 90000 00000' },
];
const incomingForCounts = [
  { id: 'row-1', externalLeadId: 'external-a', phone: '1111111111' },
  { id: 'row-2', phone: '+91 91234 56789' },
  { id: 'row-3', email: 'NEW@example.com' },
  { id: 'row-4', phone: '9123456789' },
  { id: 'row-5', name: 'No usable identity' },
  { id: 'row-6', phone: '9000000000' },
];
const preview = analyseLeadImport(existingForCounts, incomingForCounts);
assert.deepEqual(preview.counts, { new: 1, existing: 2, ambiguous: 1, invalid: 1, repeated: 1 });

const skipped = importLeadBatch(existingForCounts, incomingForCounts, { ...importOptions, duplicateMode: 'skip' });
assert.deepEqual(skipped.summary, {
  added: preview.newCount,
  replaced: 0,
  skippedExisting: preview.existingCount,
  invalid: preview.invalidCount,
  repeated: preview.repeatedCount,
  ambiguous: preview.ambiguousCount,
});
assert.equal(skipped.leads.length, existingForCounts.length + 1);
assert.equal(skipped.leads.find(lead => lead.id === 'stored-a').phone, '9876543210');

const replacedCounts = importLeadBatch(existingForCounts, incomingForCounts, { ...importOptions, importId: 'replace-counts', duplicateMode: 'replace' });
assert.deepEqual(replacedCounts.summary, {
  added: preview.newCount,
  replaced: preview.existingCount,
  skippedExisting: 0,
  invalid: preview.invalidCount,
  repeated: preview.repeatedCount,
  ambiguous: preview.ambiguousCount,
});
assert.equal(replacedCounts.leads.find(lead => lead.id === 'stored-a').phone, '1111111111', 'external ID must win over lower-priority phone matching');
assert.equal(replacedCounts.leads.find(lead => lead.id === 'stored-c').phone, '9000000000', 'ambiguous leads must not be changed');
assert.equal(replacedCounts.leads.find(lead => lead.id === 'stored-d').phone, '+91 90000 00000', 'every ambiguous candidate must remain unchanged');

for (const phone of ['+91 98765-43210', '09876543210', '0091 9876543210', '+91 (0) 9876543210', '9.87654321E+9', '+44 20 7946 0958 ext. 12', '0044 20 7946 0958']) {
  assert.equal(normalizeImportedPhone(phone), phoneIdentityKey(phone));
}
assert.equal(safeImportedLead({ name: 'Name only' }, 'invalid.csv', 0, importOptions.now), null, 'server must reject identity-less rows');
assert.equal(safeImportedLead({ email: 'not-an-email' }, 'invalid.csv', 0, importOptions.now), null, 'invalid email alone is not an identity');

// Replacement is deliberately allowlisted: imported blanks and CSV-owned workflow values cannot erase CRM work.
const protectedLead = {
  id: 'crm-lead-1',
  externalLeadId: 'external-protected',
  name: 'Old contact',
  company: 'Old company',
  phone: '09876543210',
  email: 'owner@example.com',
  city: 'Delhi',
  state: 'Delhi',
  service: 'Website',
  department: 'website',
  createdAt: '2024-01-02T03:04:05.000Z',
  stage: 'Proposal Sent',
  temp: 'Hot',
  follow: '2026-10-20',
  followTime: '16:30',
  pinned: true,
  pinLabel: 'Very Important Client',
  quote: 85000,
  deal: 80000,
  advance: 25000,
  paid: 10000,
  payment2: 5000,
  collectionDate: '2026-11-01',
  collectionNote: 'Promised payment',
  callStatus: 'proposal_sent',
  callAttempts: 4,
  lastCallAt: '2026-10-07T10:00:00.000Z',
  callHistory: [{ id: 'call-1', status: 'proposal_sent' }],
  notes: 'Keep this user note',
  assignedMemberId: 'sales-1',
  customCrmOwnerField: 'must survive',
  businessType: 'Existing type',
  profilePages: '20 pages',
  formFields: [
    { key: 'old_answer', label: 'Old answer', value: 'Keep me', displayValue: 'Keep me', isFormAnswer: true },
    { key: 'shared_answer', label: 'Shared answer', value: 'Old value', displayValue: 'Old value', isFormAnswer: true },
  ],
};
const incomingReplacement = {
  id: 'untrusted-new-id',
  externalLeadId: 'external-protected',
  name: 'Fresh contact',
  company: 'Fresh company',
  phone: '+91 98765 43210',
  email: '   ',
  city: 'Mumbai',
  state: '',
  service: '',
  department: 'profile',
  stage: 'New Lead',
  follow: '',
  pinned: false,
  paid: 0,
  notes: 'CSV must not overwrite notes',
  businessType: 'New type',
  profilePages: '',
  formFields: [
    { key: 'shared_answer', label: 'Meta Shared answer', value: 'New value', displayValue: 'New value', isFormAnswer: true },
    { key: 'new_answer', label: 'New answer', value: 'Added', displayValue: 'Added', isFormAnswer: true },
    { key: 'old_answer', label: 'Old answer', value: '   ', displayValue: '   ', isFormAnswer: true },
  ],
};
const replacement = importLeadBatch([protectedLead], [incomingReplacement], {
  ...importOptions,
  importId: 'replace-protected',
  duplicateMode: 'replace',
});
assert.deepEqual(replacement.summary, { added: 0, replaced: 1, skippedExisting: 0, invalid: 0, repeated: 0, ambiguous: 0 });
const merged = replacement.leads[0];
assert.equal(merged.id, protectedLead.id);
assert.equal(merged.name, 'Fresh contact');
assert.equal(merged.company, 'Fresh company');
assert.equal(merged.phone, '+91 98765 43210');
assert.equal(merged.city, 'Mumbai');
assert.equal(merged.businessType, 'New type');
for (const key of [
  'email', 'state', 'service', 'department', 'createdAt', 'stage', 'temp', 'follow', 'followTime', 'pinned', 'pinLabel',
  'quote', 'deal', 'advance', 'paid', 'payment2', 'collectionDate', 'collectionNote', 'callStatus', 'callAttempts',
  'lastCallAt', 'callHistory', 'notes', 'assignedMemberId', 'customCrmOwnerField', 'profilePages',
]) {
  assert.deepEqual(merged[key], protectedLead[key], `${key} must survive replacement`);
}
assert.deepEqual(merged.formFields.map(field => [field.key, field.value]), [
  ['old_answer', 'Keep me'],
  ['shared_answer', 'New value'],
  ['new_answer', 'Added'],
]);
assert.equal(merged.formFields[1].label, 'Shared answer');
assert.equal(merged.lastImportAt, importOptions.importedAt);
assert.equal(merged.lastImportId, 'replace-protected');
assert.equal(merged.importFileName, importOptions.fileName);

// The request/file size is the cap: do not silently discard the 251st+ answer.
const manyAnswers = Array.from({ length: 325 }, (_, index) => ({
  key: `question_${index + 1}`,
  label: index === 0 ? 'Meta Question 1' : `Question ${index + 1}`,
  value: `Answer ${index + 1}`,
  displayValue: `Answer ${index + 1}`,
  isFormAnswer: true,
}));
const sanitizedMany = sanitizeImportedFormFields([
  ...manyAnswers,
  { key: 'meta_full_name', label: 'Meta Full Name', value: 'Private name' },
  { key: 'campaign_name', label: 'Campaign Name', value: 'Technical value' },
  { key: 'utm_source', label: 'UTM Source', value: 'Technical value' },
]);
assert.equal(sanitizedMany.length, 325);
assert.equal(sanitizedMany[0].label, 'Question 1');
assert.ok(sanitizedMany.every(field => !/\bmeta\b/i.test(field.label)));

const exactFiltering = sanitizeImportedFormFields([
  { key: 'column_1', label: 'आपका व्यवसाय किस प्रकार का है?', value: 'रेस्टोरेंट' },
  { key: 'preferred_social_platform', label: 'Preferred social platform', value: 'Instagram' },
  { key: 'business_status', label: 'Business status', value: 'Growing' },
  { key: 'business_license_question', label: 'Do you have a business license?', value: 'Yes' },
  { key: 'meta_custom_question', label: 'Meta Custom question', value: 'Keep this answer' },
  { key: 'meta_ad_id', label: 'meta_ad_id', value: 'technical-ad-id' },
  { key: 'lead_platform', label: 'Lead Platform', value: 'facebook' },
]);
assert.deepEqual(exactFiltering.map(field => field.key), [
  'column_1',
  'preferred_social_platform',
  'business_status',
  'business_license_question',
  'meta_custom_question',
]);
assert.equal(exactFiltering[0].label, 'आपका व्यवसाय किस प्रकार का है?');
assert.equal(exactFiltering.at(-1).label, 'Custom question');

const unicodeKey = sanitizeImportedFormFields([
  { key: 'प्रश्न_१', label: 'आपको कौन सी सेवा चाहिए?', value: 'वेबसाइट' },
]);
assert.equal(unicodeKey.length, 1);
assert.match(unicodeKey[0].key, /प्रश्न/u);

const roundTrip = importLeadBatch([], [{
  id: 'many-fields-input-id',
  externalLeadId: 'many-fields-external-id',
  name: 'Many Fields',
  phone: '+91 98765 43210',
  formFields: sanitizedMany,
}], { ...importOptions, importId: 'many-fields', duplicateMode: 'skip' });
assert.equal(roundTrip.summary.added, 1);
assert.equal(roundTrip.leads[0].formFields.length, 325);

const team = [{ id: 'sales-1', name: 'Sales User', accessRole: 'sales', active: true, assignedLeadIds: [roundTrip.leads[0].id] }];
const salesState = stateForRole({ team, leads: roundTrip.leads }, { role: 'sales', memberId: 'sales-1' });
assert.equal(salesState.leads.length, 1, 'lead assignment by stable ID must remain usable');
const salesLead = salesState.leads[0];
assert.equal(salesLead.id, roundTrip.leads[0].id);
assert.equal(salesLead.formFields.length, 325);
assert.equal(salesLead.externalLeadId, undefined, 'external import identity is internal-only');
assert.notEqual(salesLead.phone, roundTrip.leads[0].phone);
assert.equal(salesLead.phoneLast4, '3210');
assert.match(salesLead.phone, /3210$/);
assert.equal(salesLead._phoneRestricted, true);

console.log('CSV import server: all tests passed');
