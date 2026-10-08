export const EMPTY_STATE = {
  team: [],
  leads: [],
  tasks: [],
  finance: [],
  importHistory: [],
  reminders: [],
  leadTrash: [],
  profile: { photo: '', name: '' },
  documents: [],
  billingProfile: {},
};

export const STAGES = [
  ['New Lead', '#64748b'],
  ['Contacted', '#2563eb'],
  ['Follow-up', '#d97706'],
  ['Not picked', '#ea580c'],
  ['Proposal Sent', '#7c3aed'],
  ['Thinking', '#db2777'],
  ['Converted / Payment Done', '#16a34a'],
  ['Archived', '#475569'],
];

export const SERVICES = [
  'Company Profile',
  'Company Profile + Website',
  'Graphic Design',
  'Website',
  'Digital Marketing',
  'Other',
];

export const ACCESS = {
  admin: ['overview', 'sales', 'tasks', 'clients', 'billing', 'finance', 'collection', 'team'],
  subadmin: ['overview', 'sales', 'tasks', 'clients', 'billing', 'finance', 'collection'],
  sales: ['sales'],
  teamlead: ['tasks'],
  team: ['tasks'],
};

export const PAGE_LABELS = {
  overview: 'Dashboard',
  sales: 'Sales',
  tasks: 'Tasks',
  clients: 'Clients',
  billing: 'Bills',
  finance: 'Finance',
  collection: 'Collection',
  team: 'Team',
};

export const PAGE_ICONS = {
  overview: '⌂', sales: '↗', tasks: '✓', clients: '◎', billing: '▤', finance: '₹', collection: '◷', team: '♙',
};

export const money = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(Number(value || 0));

export const shortDate = value => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const today = () => new Date().toISOString().slice(0, 10);
export const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
export const initials = value => String(value || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
export const normaliseStage = stage => stage === 'Converted' ? 'Converted / Payment Done' : stage === 'Lost' ? 'Archived' : STAGES.some(([name]) => name === stage) ? stage : 'New Lead';
export const received = lead => Number(lead?.advance || 0) + Number(lead?.paid || 0) + Number(lead?.payment2 || 0) + Number(lead?.payment3 || 0) + Number(lead?.payment4 || 0);
export const leadValue = lead => Number(lead?.deal || lead?.quote || 0);
export const balance = lead => Math.max(0, leadValue(lead) - received(lead));

export function documentTotals(doc) {
  const items = (doc?.items || []).reduce((sum, item) => {
    const hasQtyRate = item.qty !== '' && item.qty != null && item.rate !== '' && item.rate != null;
    return sum + (hasQtyRate ? Number(item.qty || 0) * Number(item.rate || 0) : Number(item.amount || 0));
  }, 0);
  const discount = Math.max(0, Number(doc?.discount || 0));
  const afterDiscount = Math.max(0, items - discount);
  const rate = Math.max(0, Number(doc?.gstRate || 0));
  const inclusive = doc?.gstMode === 'inclusive';
  const taxable = inclusive && rate ? afterDiscount / (1 + rate / 100) : afterDiscount;
  const gst = inclusive ? afterDiscount - taxable : taxable * rate / 100;
  const charges = (doc?.additionalCharges || []).reduce((sum, charge) => sum + Math.max(0, Number(charge?.amount || 0)), 0);
  const grand = (inclusive ? afterDiscount : taxable + gst) + charges;
  return { items, discount, taxable, gst, charges, grand };
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDelimiter(text) {
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  let lines = 0;
  for (let index = 0; index < text.length && lines < 8; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, counts.get(character) + 1);
    } else if (!quoted && character === '\n') {
      lines += 1;
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ',';
}

function csvByteEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', offset: 2 };
  }

  // UTF-16 CSV exports without a BOM still have a strong alternating-NUL
  // signature because their headings, separators, and line breaks are ASCII.
  const sampledLength = Math.min(bytes.length - (bytes.length % 2), 8192);
  let evenNuls = 0;
  let oddNuls = 0;
  for (let index = 0; index < sampledLength; index += 2) {
    if (bytes[index] === 0) evenNuls += 1;
    if (bytes[index + 1] === 0) oddNuls += 1;
  }
  const pairs = sampledLength / 2;
  if (pairs >= 2) {
    const evenRatio = evenNuls / pairs;
    const oddRatio = oddNuls / pairs;
    if (oddRatio >= 0.2 && oddRatio >= evenRatio * 3) return { encoding: 'utf-16le', offset: 0 };
    if (evenRatio >= 0.2 && evenRatio >= oddRatio * 3) return { encoding: 'utf-16be', offset: 0 };
  }
  return { encoding: 'utf-8', offset: 0 };
}

export function decodeCsvBytes(source) {
  let bytes;
  if (source instanceof Uint8Array) {
    bytes = source;
  } else if (source instanceof ArrayBuffer) {
    bytes = new Uint8Array(source);
  } else {
    throw new TypeError('CSV bytes must be an ArrayBuffer or Uint8Array');
  }

  const { encoding, offset } = csvByteEncoding(bytes);
  const input = bytes.subarray(offset);
  let text;
  try {
    text = new TextDecoder(encoding).decode(input);
  } catch (error) {
    if (encoding !== 'utf-16be') throw error;
    const swapped = new Uint8Array(input.length);
    for (let index = 0; index < input.length; index += 2) {
      swapped[index] = input[index + 1] ?? 0;
      swapped[index + 1] = input[index] ?? 0;
    }
    text = new TextDecoder('utf-16le').decode(swapped);
  }
  return text.replace(/^\uFEFF/, '');
}

export function normaliseCsvHeader(value, index = 0) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `column_${index + 1}`;
}

export function parseCsvDocument(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('CSV file is empty');
  const delimiter = csvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (quoted) throw new Error('CSV has an unfinished quoted field');
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one lead');

  const seen = new Map();
  const used = new Set();
  const columns = rows.shift().map((value, index) => {
    let label = String(value ?? '').trim();
    if (index === 0) label = label.replace(/^\uFEFF/, '');
    const base = normaliseCsvHeader(label, index);
    let occurrence = seen.get(base) || 0;
    let key;
    do {
      occurrence += 1;
      key = occurrence === 1 ? base : `${base}_${occurrence}`;
    } while (used.has(key));
    seen.set(base, occurrence);
    used.add(key);
    return { key, label };
  });
  const headers = columns.map(column => column.key);
  const records = rows.map(values => Object.fromEntries(columns.map((column, index) => [column.key, values[index] ?? ''])));
  return { delimiter, headers, columns, records };
}

function csvPhone(value) {
  const clean = String(value || '').trim().replace(/^'/, '');
  if (/^\d+(?:\.\d+)?e\+\d+$/i.test(clean)) {
    const numeric = Number(clean);
    if (Number.isFinite(numeric)) return numeric.toFixed(0);
  }
  return clean;
}

function csvRecordEntries(record, columns) {
  const source = record && typeof record === 'object' ? record : {};
  const supplied = Array.isArray(columns) ? columns : [];
  const entries = [];
  const seen = new Set();
  for (const column of supplied) {
    const key = String(column?.key || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = String(column?.label ?? key).trim() || key;
    entries.push({ key, label, value: String(source[key] ?? '').trim() });
  }
  for (const [key, value] of Object.entries(source)) {
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      key,
      label: String(key).replace(/_+/g, ' ').replace(/\b\w/g, character => character.toUpperCase()),
      value: String(value ?? '').trim(),
    });
  }
  return entries.map(entry => ({
    ...entry,
    normalKey: normaliseCsvHeader(entry.key),
    normalLabel: normaliseCsvHeader(entry.label),
  }));
}

function entryValue(entries, aliases, patterns = []) {
  for (const alias of aliases) {
    const found = entries.find(entry => entry.normalKey === alias && entry.value);
    if (found) return found.value;
  }
  for (const pattern of patterns) {
    const found = entries.find(entry => entry.value && (pattern.test(entry.normalKey) || pattern.test(entry.normalLabel)));
    if (found) return found.value;
  }
  return '';
}

export function importFieldLabel(value, fallback = '') {
  const clean = source => String(source || '')
    .replace(/_+/g, ' ')
    .replace(/\bmeta\b/gi, ' ')
    .replace(/^[\s_:|/\\\-–—]+|[\s_:|/\\\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const cleaned = clean(value);
  if (cleaned) return cleaned;
  return clean(fallback).replace(/\b\w/g, character => character.toUpperCase());
}

function usefulCsvValue(value) {
  const text = String(value ?? '').trim();
  return text && !/^(?:-|—|–|n\/?a|none|null|undefined|not available)$/i.test(text);
}

function importFieldIdentities(key, label = key) {
  return [...new Set([key, label].map(value => String(value || '')
    .replace(/_+/g, ' ')
    .replace(/\bmeta\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim())
    .filter(Boolean)
    .map(value => normaliseCsvHeader(value)))]
    .filter(Boolean);
}

const CONTACT_IMPORT_FIELD_PATTERNS = [
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:full_|contact_|customer_|lead_)?name$/,
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:phone|mobile|telephone|whatsapp|contact_number)(?:_number)?$/,
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:e_?mail)(?:_address)?$/,
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:(?:company|business|organisation|organization)_name|company|organisation|organization)$/,
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:street_)?address$/,
  /^(?:(?:what_is|enter|please_enter)_)?(?:your_)?(?:city|district|location|state|postal_code|postcode|zip_code|pincode)$/,
];

const TECHNICAL_IMPORT_FIELD_PATTERNS = [
  /^(?:id|lead_id|external_lead_id|externalleadid|record_id|row_id|field_id|question_id)$/,
  /^(?:ad|advertisement|adset|ad_set|campaign|form)(?:_(?:id|name))?$/,
  /^(?:page|account|pixel)_(?:id|name)$/,
  /^(?:status|lead_status)(?:_[a-z0-9]+)*$/,
  /^(?:platform|lead_platform|source_platform|publisher_platform)(?:_[a-z0-9]+)*$/,
  /^(?:(?:phone(?:_number)?|e_?mail)(?:_address)?_)?(?:is_)?(?:verified|verification)(?:_[a-z0-9]+)*$/,
  /^(?:tracking)(?:_[a-z0-9]+)*$/,
  /^(?:click_id|google_click_id|facebook_click_id|gclid|fbclid|msclkid|ttclid|clid)$/,
  /^utm(?:_[a-z0-9]+)*$/,
  /^(?:license|licence)(?:_[a-z0-9]+)*$/,
  /^(?:system|internal)(?:_[a-z0-9]+)*$/,
  /^(?:created|updated|submitted|received)(?:_at|_time|_date)?$/,
  /^(?:date|time)_(?:created|updated|submitted|received)$/,
  /^(?:timestamp|is_organic|organic|lead_source|source|import_source|import_file_name|row_number)$/,
  /^(?:ip|ip_address|user_agent|browser_id)$/,
];

export function isContactImportField(key, label = key) {
  return importFieldIdentities(key, label).some(value => CONTACT_IMPORT_FIELD_PATTERNS.some(pattern => pattern.test(value)));
}

export function isTechnicalImportField(key, label = key) {
  return importFieldIdentities(key, label).some(value => TECHNICAL_IMPORT_FIELD_PATTERNS.some(pattern => pattern.test(value)));
}

function csvFormFields(entries) {
  return entries
    .filter(entry => usefulCsvValue(entry.value)
      && !isContactImportField(entry.normalKey, entry.normalLabel)
      && !isTechnicalImportField(entry.normalKey, entry.normalLabel))
    .map(entry => ({
      key: entry.key,
      label: importFieldLabel(entry.label, entry.key),
      value: entry.value,
      displayValue: entry.value,
      isFormAnswer: true,
    }));
}

export function csvRecordToLead(record, { columns = [], fileName = 'Imported CSV', index = 0, now = Date.now() } = {}) {
  const entries = csvRecordEntries(record, columns);
  const value = (aliases, patterns = []) => entryValue(entries, aliases, patterns);
  const service = value(
    ['service', 'requirement', 'requested_service', 'interested_in', 'product', 'service_name'],
    [/^(?:what_)?(?:service|requirement)_/, /what_(?:service|do_you_need|are_you_looking_for)/, /looking_for/],
  );
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const externalLeadId = value(['lead_id', 'id', 'external_lead_id']);
  return {
    id: uid('lead'),
    externalLeadId: String(externalLeadId || '').trim().replace(/^'/, ''),
    name: value(
      ['full_name', 'name', 'contact_name', 'customer_name', 'lead_name'],
      [/(?:^|_)(?:full|contact|customer|lead|your)_name$/],
    ),
    company: value(
      ['company', 'company_name', 'business_name', 'organisation', 'organization'],
      [/(?:company|business|organisation|organization)_name$/],
    ),
    phone: csvPhone(value(
      ['phone_number', 'phone', 'mobile', 'mobile_number', 'contact_number', 'whatsapp_number', 'telephone'],
      [/(?:^|_)(?:phone|mobile|telephone|whatsapp)(?:_number)?$/],
    )),
    email: value(['email', 'email_address', 'e_mail'], [/(?:^|_)(?:e_?mail)(?:_address)?$/]),
    city: value(
      ['city', 'location', 'city_name', 'district'],
      [/(?:^|_)(?:city|district|location)(?:_name)?$/],
    ),
    state: value(['state', 'state_name', 'province'], [/(?:^|_)(?:state|province)(?:_name)?$/]),
    service,
    notes: value(['notes', 'note', 'comments', 'comment', 'message', 'remarks', 'remark']),
    businessType: value(
      ['business_type', 'type_of_business', 'company_type', 'industry', 'nature_of_business'],
      [/business.*(?:type|category|operate)/, /(?:type|kind|nature).*business/, /(?:company_type|industry)/],
    ),
    profilePages: value(
      ['profile_pages', 'company_profile_pages', 'number_of_profile_pages'],
      [/(?:pages|page_count).*profile/, /profile.*(?:pages|page_count)/, /how_many_pages/],
    ),
    profileBudget: value(
      ['profile_budget', 'company_profile_budget', 'approximate_budget', 'what_is_your_approximate_budget'],
      [/(?:budget|investment).*profile/, /profile.*(?:budget|investment)/, /^what_is_your_approximate_budget$/],
    ),
    contentReadiness: value(
      ['content_readiness', 'content_ready', 'company_content_ready'],
      [/content.*(?:ready|available|availability)/, /(?:ready|have).*content/],
    ),
    websiteBudget: value(
      ['website_budget', 'website_requirement', 'website_requirement_budget'],
      [/(?:budget|investment).*website/, /website.*(?:budget|investment|requirement)/],
    ),
    serverRequirement: value(
      ['server_requirement', 'server_required', 'hosting_requirement', 'domain_and_hosting', 'do_you_want_server_from_us'],
      [/(?:server|hosting).*requirement/, /(?:need|have|want).*(?:server|hosting|domain)/, /(?:server|hosting|domain).*(?:need|have|want)/],
    ),
    formFields: csvFormFields(entries),
    stage: 'New Lead',
    temp: 'Warm',
    callStatus: 'not_called',
    imported: true,
    source: 'CSV',
    importSource: 'CSV',
    importFileName: String(fileName || 'Imported CSV').slice(0, 180),
    createdAt: new Date(timestamp + Number(index || 0)).toISOString(),
  };
}

export function phoneIdentityKey(value) {
  const source = csvPhone(value).replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i, '');
  let digits = source.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith('910')) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length < 7 || digits.length > 15 || /^0+$/.test(digits)) return '';
  return digits;
}

export function emailIdentityKey(value) {
  let email = String(value || '').normalize('NFKC').trim().toLowerCase();
  const bracketed = email.match(/<([^<>]+)>/);
  if (bracketed) email = bracketed[1].trim();
  email = email.replace(/^mailto:/, '').replace(/^['"]|['"]$/g, '');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function externalIdentityKey(value) {
  return String(value || '').normalize('NFKC').trim().replace(/^'/, '').toLowerCase();
}

function leadIdentity(lead) {
  return {
    external: externalIdentityKey(lead?.externalLeadId || lead?.metaLeadId || lead?.external_id),
    phone: phoneIdentityKey(lead?.phone || lead?.mobile || lead?.phoneNumber),
    email: emailIdentityKey(lead?.email || lead?.emailAddress),
  };
}

function addIdentity(indexes, identity, value) {
  for (const type of ['external', 'phone', 'email']) {
    const key = identity[type];
    if (!key) continue;
    const values = indexes[type].get(key) || [];
    values.push(value);
    indexes[type].set(key, values);
  }
}

function identityMatch(indexes, identity) {
  for (const type of ['external', 'phone', 'email']) {
    const key = identity[type];
    if (!key) continue;
    const matches = indexes[type].get(key) || [];
    if (matches.length) return { type, key, matches };
  }
  return null;
}

export function analyseLeadImport(existing, incoming) {
  const existingLeadsSource = Array.isArray(existing) ? existing : [];
  const incomingLeads = Array.isArray(incoming) ? incoming : [];
  const indexes = { external: new Map(), phone: new Map(), email: new Map() };
  existingLeadsSource.forEach((lead, index) => addIdentity(indexes, leadIdentity(lead), { lead, index }));

  const seen = { external: new Map(), phone: new Map(), email: new Map() };
  const leads = [];
  const newLeads = [];
  const existingLeads = [];
  const ambiguousLeads = [];
  const invalidLeads = [];
  const repeatedLeads = [];
  const diagnostics = [];

  incomingLeads.forEach((lead, index) => {
    if (!lead || typeof lead !== 'object') {
      invalidLeads.push(lead);
      diagnostics.push({ index, classification: 'invalid', reason: 'Row is not a lead object' });
      return;
    }
    const identity = leadIdentity(lead);
    if (!identity.external && !identity.phone && !identity.email) {
      invalidLeads.push(lead);
      diagnostics.push({ index, classification: 'invalid', reason: 'No usable external ID, phone, or email' });
      return;
    }

    const repeated = identityMatch(seen, identity);
    if (repeated) {
      repeatedLeads.push(lead);
      diagnostics.push({ index, classification: 'repeated', matchedBy: repeated.type, matchCount: repeated.matches.length });
      addIdentity(seen, identity, { lead, index });
      return;
    }

    addIdentity(seen, identity, { lead, index });
    const matched = identityMatch(indexes, identity);
    if (matched?.matches.length > 1) {
      ambiguousLeads.push(lead);
      diagnostics.push({ index, classification: 'ambiguous', matchedBy: matched.type, matchCount: matched.matches.length });
      return;
    }

    leads.push(lead);
    if (matched) {
      existingLeads.push(lead);
      diagnostics.push({ index, classification: 'existing', matchedBy: matched.type, matchCount: 1, existingIndex: matched.matches[0].index });
    } else {
      newLeads.push(lead);
      diagnostics.push({ index, classification: 'new' });
    }
  });

  const counts = {
    new: newLeads.length,
    existing: existingLeads.length,
    ambiguous: ambiguousLeads.length,
    invalid: invalidLeads.length,
    repeated: repeatedLeads.length,
  };
  const groups = {
    new: newLeads,
    existing: existingLeads,
    ambiguous: ambiguousLeads,
    invalid: invalidLeads,
    repeated: repeatedLeads,
  };
  return {
    totalRows: incomingLeads.length,
    dedupedCount: leads.length,
    leads,
    dedupedLeads: leads,
    newLeads,
    existingLeads,
    ambiguousLeads,
    invalidLeads,
    repeatedLeads,
    invalidRows: invalidLeads,
    repeatedRows: repeatedLeads,
    newCount: counts.new,
    existingCount: counts.existing,
    ambiguousCount: counts.ambiguous,
    invalidCount: counts.invalid,
    repeatedCount: counts.repeated,
    counts,
    groups,
    diagnostics,
  };
}

export function downloadCsv(name, rows) {
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
