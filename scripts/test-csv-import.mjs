import assert from 'node:assert/strict';
import {
  analyseLeadImport,
  csvRecordToLead,
  decodeCsvBytes,
  emailIdentityKey,
  importFieldLabel,
  isTechnicalImportField,
  parseCsvDocument,
  phoneIdentityKey,
} from '../lib/client/business.js';

const comma = parseCsvDocument('\uFEFFFull Name,Phone Number,Requirement,Notes\r\n"Asha, Jain",9876543210,Website,"First line\nSecond line"\r\nRavi,9.876543211E+9,Company Profile,Ready');
assert.equal(comma.records.length, 2);
assert.deepEqual(comma.columns, [
  { key: 'full_name', label: 'Full Name' },
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'requirement', label: 'Requirement' },
  { key: 'notes', label: 'Notes' },
]);
assert.equal(comma.records[0].full_name, 'Asha, Jain');
assert.equal(comma.records[0].notes, 'First line\nSecond line');
assert.equal(csvRecordToLead(comma.records[0], { columns: comma.columns, fileName: 'meta.csv' }).phone, '9876543210');
assert.equal(csvRecordToLead(comma.records[1], { columns: comma.columns, fileName: 'meta.csv' }).phone, '9876543211');

const duplicates = parseCsvDocument('Name,Name,Name 2,,Phone\nFirst,Second,Third,Useful,9876543210');
assert.deepEqual(duplicates.columns, [
  { key: 'name', label: 'Name' },
  { key: 'name_2', label: 'Name' },
  { key: 'name_2_2', label: 'Name 2' },
  { key: 'column_4', label: '' },
  { key: 'phone', label: 'Phone' },
]);

const semicolon = parseCsvDocument('Name;Mobile Number;City;Service\nNeha;9811111111;Delhi;Website');
assert.equal(semicolon.delimiter, ';');
assert.equal(csvRecordToLead(semicolon.records[0]).city, 'Delhi');
assert.equal(csvRecordToLead(semicolon.records[0]).service, 'Website');

const tab = parseCsvDocument('Contact Name\tWhatsApp Number\tBusiness Name\nKabir\t9822222222\tExample Co');
assert.equal(tab.delimiter, '\t');
assert.equal(csvRecordToLead(tab.records[0]).company, 'Example Co');

const utf16Source = 'Full Name,Phone Number,What type of business do you operate?,Meta Profile Budget\r\nAnita,09876543210,Hotel,"₹25,000"';
const utf16leWithBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf16Source, 'utf16le')]);
const utf16Text = decodeCsvBytes(utf16leWithBom);
const utf16 = parseCsvDocument(utf16Text);
assert.equal(utf16.columns[2].label, 'What type of business do you operate?');
assert.equal(utf16.records[0].full_name, 'Anita');

const utf16leWithoutBom = Buffer.from('Full Name\tPhone\nBeena\t9876543210', 'utf16le');
assert.match(decodeCsvBytes(utf16leWithoutBom), /^Full Name\tPhone/);
const utf16beWithoutBom = Uint8Array.from(utf16leWithoutBom, (_, index) => utf16leWithoutBom[index % 2 ? index - 1 : index + 1]);
assert.match(decodeCsvBytes(utf16beWithoutBom), /^Full Name\tPhone/);
const utf16beWithBom = Uint8Array.from([0xfe, 0xff, ...utf16beWithoutBom]);
assert.match(decodeCsvBytes(utf16beWithBom.buffer), /^Full Name\tPhone/);
assert.equal(decodeCsvBytes(new TextEncoder().encode('\uFEFFName,Email\nDev,dev@example.com').buffer), 'Name,Email\nDev,dev@example.com');
assert.throws(() => decodeCsvBytes('not bytes'), /ArrayBuffer or Uint8Array/);

const formCsv = parseCsvDocument([
  'ID,Meta Full Name,Phone Number,Email,City,Requirement,Meta What type of business do you operate?,How many pages in the company profile?,what_is_your_approximate_budget?,Is your company content ready?,Website budget,do_you_want_server_from_us_,Preferred colour,Preferred social platform,Business status,Do you have a business license?,Ad ID,Adset Name,Campaign Name,Form ID,Lead Status,Platform,Phone Number Verified,UTM Source,Tracking ID,System Note,Internal Owner,License ID',
  'lead-7,Kiran,+91 98765 43210,kiran@example.com,Pune,Website,Restaurant,12 pages,"₹30,000",Yes,"₹50,000",Domain and hosting needed,Blue,Instagram,Expanding,Yes,ad-1,Set A,Campaign A,form-2,new,facebook,true,social,track-9,hidden,owner-1,lic-3',
].join('\n'));
const mapped = csvRecordToLead(formCsv.records[0], { columns: formCsv.columns, fileName: 'real-meta-export.csv', now: 0 });
assert.equal(mapped.externalLeadId, 'lead-7');
assert.equal(mapped.businessType, 'Restaurant');
assert.equal(mapped.profilePages, '12 pages');
assert.equal(mapped.profileBudget, '₹30,000');
assert.equal(mapped.contentReadiness, 'Yes');
assert.equal(mapped.websiteBudget, '₹50,000');
assert.equal(mapped.serverRequirement, 'Domain and hosting needed');
assert.ok(mapped.formFields.some(field => field.label === 'What type of business do you operate?' && field.value === 'Restaurant'));
assert.ok(mapped.formFields.some(field => field.label === 'Preferred colour' && field.value === 'Blue'));
assert.ok(mapped.formFields.some(field => field.label === 'Requirement' && field.value === 'Website'));
assert.ok(mapped.formFields.some(field => field.label === 'Preferred social platform' && field.value === 'Instagram'));
assert.ok(mapped.formFields.some(field => field.label === 'Business status' && field.value === 'Expanding'));
assert.ok(mapped.formFields.some(field => field.label === 'Do you have a business license?' && field.value === 'Yes'));
assert.ok(mapped.formFields.some(field => field.key === 'what_is_your_approximate_budget' && field.label === 'what is your approximate budget?'));
assert.ok(mapped.formFields.some(field => field.key === 'do_you_want_server_from_us' && field.label === 'do you want server from us'));
assert.ok(mapped.formFields.every(field => !/\bmeta\b/i.test(field.label)));
assert.ok(mapped.formFields.every(field => !['ID', 'Meta Full Name', 'Phone Number', 'Email', 'City', 'Ad ID', 'Adset Name', 'Campaign Name', 'Form ID', 'Lead Status', 'Platform', 'Phone Number Verified', 'UTM Source', 'Tracking ID', 'System Note', 'Internal Owner', 'License ID'].includes(field.label)));
assert.ok(mapped.formFields.every(field => field.displayValue === field.value && field.isFormAnswer === true));
assert.equal(isTechnicalImportField('platform', 'Platform'), true);
assert.equal(isTechnicalImportField('preferred_social_platform', 'Preferred social platform'), false);
assert.equal(isTechnicalImportField('business_status', 'Business status'), false);
assert.equal(isTechnicalImportField('status_code', 'Status code'), true);
assert.equal(isTechnicalImportField('tracking_parameters', 'Tracking parameters'), true);
assert.equal(isTechnicalImportField('verification_method', 'Verification method'), true);
assert.equal(isTechnicalImportField('license_id', 'License ID'), true);
assert.equal(isTechnicalImportField('do_you_have_a_business_license', 'Do you have a business license?'), false);
assert.equal(isTechnicalImportField('meta_ad_id', 'meta_ad_id'), true);
assert.equal(importFieldLabel('meta_custom_question'), 'custom question');

const rawMetaLabel = parseCsvDocument('meta_custom_question,meta_ad_id\nUseful answer,technical-1');
const rawMetaLead = csvRecordToLead(rawMetaLabel.records[0], { columns: rawMetaLabel.columns });
assert.equal(rawMetaLabel.columns[0].label, 'meta_custom_question');
assert.deepEqual(rawMetaLead.formFields.map(field => [field.key, field.label]), [['meta_custom_question', 'custom question']]);

const partial = parseCsvDocument('ID,Phone Number,Preferred social platform\nlead-8,9876543210,LinkedIn');
const partialLead = csvRecordToLead(partial.records[0], { columns: partial.columns });
assert.equal(partialLead.service, '');
assert.equal(partialLead.formFields.find(field => field.key === 'preferred_social_platform')?.value, 'LinkedIn');

assert.equal(phoneIdentityKey('+91 98765-43210'), '9876543210');
assert.equal(phoneIdentityKey('09876543210'), '9876543210');
assert.equal(phoneIdentityKey('0091 9876543210'), '9876543210');
assert.equal(phoneIdentityKey('+91 (0) 9876543210'), '9876543210');
assert.equal(phoneIdentityKey('9.87654321E+9'), '9876543210');
assert.equal(phoneIdentityKey('+44 20 7946 0958 ext. 12'), '442079460958');
assert.equal(phoneIdentityKey('0044 20 7946 0958'), '442079460958');
assert.equal(phoneIdentityKey('123'), '');
assert.equal(emailIdentityKey(' User@Example.COM '), 'user@example.com');
assert.equal(emailIdentityKey('not-an-email'), '');

const existing = [
  { id: 'stored-a', externalLeadId: 'external-a', phone: '9876543210', email: 'a@example.com' },
  { id: 'stored-b', phone: '9123456789', email: 'b@example.com' },
  { id: 'stored-c', phone: '9000000000' },
  { id: 'stored-d', phone: '+91 90000 00000' },
];
const incoming = [
  { id: 'row-1', externalLeadId: 'external-a', phone: '1111111111' },
  { id: 'row-2', phone: '+91 91234 56789' },
  { id: 'row-3', email: 'NEW@example.com' },
  { id: 'row-4', phone: '9123456789' },
  { id: 'row-5', name: 'No identity' },
  { id: 'row-6', phone: '9000000000' },
];
const analysis = analyseLeadImport(existing, incoming);
assert.equal(analysis.totalRows, 6);
assert.equal(analysis.dedupedCount, 3);
assert.deepEqual(analysis.counts, { new: 1, existing: 2, ambiguous: 1, invalid: 1, repeated: 1 });
assert.equal(analysis.newCount, 1);
assert.equal(analysis.existingCount, 2);
assert.equal(analysis.ambiguousCount, 1);
assert.equal(analysis.invalidCount, 1);
assert.equal(analysis.repeatedCount, 1);
assert.deepEqual(analysis.leads.map(lead => lead.id), ['row-1', 'row-2', 'row-3']);
assert.strictEqual(analysis.leads, analysis.dedupedLeads);
assert.deepEqual(analysis.existingLeads.map(lead => lead.id), ['row-1', 'row-2']);
assert.deepEqual(analysis.newLeads.map(lead => lead.id), ['row-3']);
assert.deepEqual(analysis.repeatedLeads.map(lead => lead.id), ['row-4']);
assert.deepEqual(analysis.invalidLeads.map(lead => lead.id), ['row-5']);
assert.deepEqual(analysis.ambiguousLeads.map(lead => lead.id), ['row-6']);
assert.deepEqual(analysis.diagnostics.map(item => item.index), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(analysis.diagnostics.map(item => item.classification), ['existing', 'existing', 'new', 'repeated', 'invalid', 'ambiguous']);
assert.deepEqual(
  { matchedBy: analysis.diagnostics[0].matchedBy, matchCount: analysis.diagnostics[0].matchCount, existingIndex: analysis.diagnostics[0].existingIndex },
  { matchedBy: 'external', matchCount: 1, existingIndex: 0 },
);

assert.throws(() => parseCsvDocument(''), /empty/i);
assert.throws(() => parseCsvDocument('Name,Phone'), /header row/i);

console.log('CSV import parser: all tests passed');
