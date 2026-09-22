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

export function downloadCsv(name, rows) {
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
