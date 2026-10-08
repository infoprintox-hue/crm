// Optional browser regression test. All application API calls are intercepted;
// this test does not read or write a real customer database.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { importLeadBatch } from '../lib/server/state.js';
import { EMPTY_STATE } from '../lib/client/business.js';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const originalLeads = Array.from({ length: 24 }, (_, index) => ({
  id: `old-${index}`, externalLeadId: `export-${index}`, name: `Original ${index}`,
  phone: String(9800000000 + index), email: '', company: 'Existing company', city: 'Delhi',
  service: 'Website', department: 'website', stage: 'Follow-up', temp: 'Hot',
  follow: '2026-12-12', followTime: '11:00', notes: 'Keep my sales note',
  deal: 25000, paid: 10000, pinned: index === 0,
  callHistory: [{ id: `call-${index}`, note: 'Previous conversation' }],
  createdAt: '2026-09-01T09:00:00.000Z',
}));
let state = { ...structuredClone(EMPTY_STATE), leads: structuredClone(originalLeads), team: [{ id: 'sales-1', name: 'Test Sales', accessRole: 'sales', assignedLeadIds: ['old-0'] }] };
const user = { role: 'admin', name: 'Test Admin' };
const requests = [];
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  let response = {};
  if (url.pathname === '/api/auth') response = { user, members: [] };
  else if (url.pathname === '/api/state') {
    if (request.method() === 'POST') {
      const { operation } = request.postDataJSON();
      assert.equal(operation.type, 'importLeads');
      requests.push(operation);
      const batch = importLeadBatch(state.leads, operation.leads, operation);
      state = { ...state, leads: batch.leads };
      response = { importSummary: batch.summary };
    }
    response = { ...response, data: state, user, revision: 1 };
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
});

const rows = ['id\tfull_name\tphone_number\twhat_type_of_business_do_you_operate?\thow_many_pages_you_need_for_your_profile\twhat_is_your_approximate_budget?\tis_your_company_content_ready?\tdo_you_want_server_from_us_\tpreferred_social_platform\tad_id\tplatform'];
for (let index = 0; index < 35; index += 1) rows.push(`export-${index}\tUpdated ${index}\t+91 ${9800000000 + index}\tManufacturing\t12 pages\t25000\tYes\tYes please\tLinkedIn\tad-test\tfacebook`);
const fixture = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(rows.join('\r\n'), 'utf16le')]);
async function selectCsv() {
  await page.locator('input[accept*=".csv"]').setInputFiles({ name: 'form-export.csv', mimeType: 'text/csv', buffer: fixture });
  await page.getByRole('dialog', { name: 'Review CSV import' }).waitFor();
}
async function metric(label) {
  const card = page.locator('.csv-import-count').filter({ has: page.getByText(label, { exact: true }) });
  return Number(await card.locator('strong').textContent());
}
async function closeResult() {
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
}

try {
  await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:3100');
  await page.locator('button[data-page="sales"]').click();
  await selectCsv();
  assert.equal(await metric('New leads'), 11);
  assert.equal(await metric('Existing leads'), 24);
  assert.equal(requests.length, 0, 'Preview must not save anything');
  await mkdir('output/qa', { recursive: true });
  await page.screenshot({ path: 'output/qa/csv-import-preview.png', fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(requests.length, 0, 'Cancel must not save anything');

  await selectCsv();
  await page.getByRole('button', { name: 'Add new leads only', exact: true }).click();
  await page.getByText('Import complete', { exact: true }).waitFor();
  assert.equal(state.leads.length, 35);
  assert.equal(requests.at(-1).duplicateMode, 'skip');
  for (const old of originalLeads) assert.deepEqual(state.leads.find(lead => lead.id === old.id), old);
  await closeResult();

  await selectCsv();
  assert.equal(await metric('New leads'), 0);
  assert.equal(await metric('Existing leads'), 35);
  await page.getByRole('button', { name: 'Add new + update existing', exact: true }).click();
  await page.getByText('Import complete', { exact: true }).waitFor();
  assert.equal(state.leads.length, 35);
  assert.equal(requests.at(-1).duplicateMode, 'replace');
  const updated = state.leads.find(lead => lead.id === 'old-0');
  assert.equal(updated.name, 'Updated 0');
  for (const key of ['id', 'createdAt', 'service', 'stage', 'follow', 'followTime', 'notes', 'deal', 'paid', 'pinned', 'callHistory']) {
    assert.deepEqual(updated[key], originalLeads[0][key], `${key} must survive replacement`);
  }
  assert.deepEqual(state.team[0].assignedLeadIds, ['old-0']);
  assert.equal(updated.formFields.length, 6);
  assert.ok(updated.formFields.every(field => !['ad_id', 'platform'].includes(field.key)));
  await closeResult();
  await page.getByText('Updated 0', { exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Edit lead' }).waitFor();
  const requirements = page.locator('.lead-requirements');
  assert.match(await requirements.textContent(), /Manufacturing/);
  assert.match(await requirements.textContent(), /12 pages/);
  assert.match(await requirements.textContent(), /25000/);
  assert.match(await requirements.textContent(), /Yes please/);
  assert.match(await requirements.textContent(), /LinkedIn/);
  assert.doesNotMatch(await requirements.textContent(), /ad-test|facebook|\bMeta\b/);
  await page.screenshot({ path: 'output/qa/imported-lead-details.png', fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log('Browser CSV flow passed: preview, cancel, 11 new / 24 existing, skip, replace, full fields, preserved CRM history.');
} finally {
  await browser.close();
}
