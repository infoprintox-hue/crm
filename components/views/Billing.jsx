'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { documentTotals, money, shortDate, today, uid } from '@/lib/client/business';
import { Button, Empty, Field, Modal } from '../ui';

export const DOCUMENT_TYPES = [
  ['sales_invoice', 'Sales Invoice'],
  ['quotation', 'Quotation'],
  ['estimate', 'Estimate'],
  ['proforma', 'Proforma Invoice'],
  ['invoice', 'Invoice'],
];
export const INVOICE_KINDS = ['sales_invoice', 'invoice'];
export const OFFER_KINDS = ['quotation', 'estimate', 'proforma'];

const DEFAULT_PROFILE = { name: 'visitinglink', address: '', state: 'Uttar Pradesh', country: 'India', gstin: '', pan: '', email: 'info.visitinglink@gmail.com', phone: '+91 70070 30484', logo: '' };
const DEFAULT_PRINT_SETTINGS = { theme: 'reference', marginTop: 12, marginRight: 10, marginBottom: 22, marginLeft: 10 };
const DEFAULT_TERMS = ['No Refund Policy After Any payment', 'Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments.'];
const TYPE_LABEL = Object.fromEntries(DOCUMENT_TYPES);
const EMPTY_LINE = (group = '') => ({ id: uid('line'), group, name: '', details: '', hsn: '', gstRate: '', qty: 1, unit: 'Unit', rate: '', amount: '', image: '' });
const isInvoice = kind => INVOICE_KINDS.includes(kind);
const isOffer = kind => OFFER_KINDS.includes(kind);
const typeLabel = kind => TYPE_LABEL[kind] || 'Invoice';
const monthKey = value => /^\d{4}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 7) : '';
const monthLabel = value => { const [year, month] = String(value).split('-').map(Number); return year && month ? new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : value; };
const balanceOf = doc => Math.max(0, documentTotals(doc).grand - Number(doc.paid || 0));
const rupee = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)).replace('₹', 'Rs. ');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const plain = value => String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?(?:p|div|li|h[1-6]|blockquote)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

function nextNumber(documents, kind) {
  const numbers = documents.filter(doc => doc.kind === kind).map(doc => Number(String(doc.number || '').replace(/\D/g, ''))).filter(Boolean);
  const prefix = { quotation: 'Q', estimate: 'E', proforma: 'PI', sales_invoice: 'SI', invoice: 'INV' }[kind] || 'DOC';
  return `${prefix}${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0')}`;
}

function termsOf(doc) {
  if (Array.isArray(doc?.termRows) && doc.termRows.length) return doc.termRows.map(row => ({ id: row.id || uid('term'), text: row.text || '', group: row.group || '' }));
  const rows = String(doc?.terms || '').split('\n').map(row => row.replace(/^\s*\d+[.)]?\s*/, '').trim()).filter(Boolean);
  return (rows.length ? rows : DEFAULT_TERMS).map(text => ({ id: uid('term'), text, group: '' }));
}

function safeRich(value) {
  if (typeof window === 'undefined') return esc(plain(value)).replace(/\n/g, '<br>');
  const root = new DOMParser().parseFromString(`<div>${String(value || '')}</div>`, 'text/html').body.firstElementChild;
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'S', 'U', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'H4']);
  [...root.querySelectorAll('*')].forEach(node => {
    if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
    [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
  });
  return root.innerHTML;
}

function amountWords(value) {
  const small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const part = number => { const out = []; let n = number; if (n >= 100) { out.push(`${small[Math.floor(n / 100)]} Hundred`); n %= 100; } if (n >= 20) { out.push(tens[Math.floor(n / 10)]); n %= 10; } if (n) out.push(small[n]); return out.join(' '); };
  let number = Math.round(Number(value || 0));
  if (!number) return 'ZERO RUPEES ONLY';
  const out = [];
  [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']].forEach(([base, label]) => { if (number >= base) { out.push(`${part(Math.floor(number / base))} ${label}`); number %= base; } });
  if (number) out.push(part(number));
  return `${out.join(' ')} Rupees Only`.toUpperCase();
}

export function printBillingDocument(doc, billingProfile = {}) {
  const seller = { ...DEFAULT_PROFILE, ...billingProfile, ...(doc.seller || {}) };
  const totals = documentTotals(doc);
  const title = doc.title || typeLabel(doc.kind);
  const profileHasLogo = Object.prototype.hasOwnProperty.call(billingProfile || {}, 'logo');
  const logo = (profileHasLogo ? billingProfile.logo : seller.logo) || `${window.location.origin}/assets/visitinglink-logo-invoice.png`;
  const printSettings = { ...DEFAULT_PRINT_SETTINGS, ...(doc.printSettings || {}) };
  const margin = (key, fallback) => Math.min(28, Math.max(6, Number(printSettings[key]) || fallback));
  const pageMargins = `${margin('marginTop', 12)}mm ${margin('marginRight', 10)}mm ${Math.max(20, margin('marginBottom', 22))}mm ${margin('marginLeft', 10)}mm`;
  const currency = value => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`;
  const intra = !doc.clientState || /^(uttar pradesh|up|u\.p\.?)$/i.test(String(doc.clientState).trim());
  const rows = (doc.items || []).map((item, index) => {
    const amount = item.qty !== '' && item.rate !== '' ? Number(item.qty || 0) * Number(item.rate || 0) : Number(item.amount || 0);
    return `<tr><td class="item"><div class="item-heading"><b>${index + 1}.</b><strong>${esc(item.name)}</strong></div></td><td class="num">${esc(item.qty === '' ? '-' : item.qty)}</td><td class="num">${item.rate === '' ? '-' : currency(item.rate)}</td><td class="num">${currency(amount)}</td></tr>`;
  }).join('');
  const details = (doc.items || []).filter(item => item.details).map((item, index) => `<section class="detail-block">${doc.items.length > 1 ? `<h2>${index + 1}. ${esc(item.name)}</h2>` : ''}${safeRich(item.details)}</section>`).join('');
  const taxRows = Number(doc.gstRate || 0) > 0 ? (intra
    ? `<tr><td>CGST (${Number(doc.gstRate) / 2}%) + SGST (${Number(doc.gstRate) / 2}%)</td><td>${currency(totals.gst)}</td></tr>`
    : `<tr><td>IGST (${Number(doc.gstRate)}%)</td><td>${currency(totals.gst)}</td></tr>`) : '';
  const charges = (doc.additionalCharges || []).filter(charge => Number(charge.amount || 0)).map(charge => `<tr><td>${esc(charge.label || 'Additional charge')}</td><td>${currency(charge.amount)}</td></tr>`).join('');
  const terms = termsOf(doc).map((term, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b><span>${esc(plain(term.text))}</span></div>`).join('');
  const customFields = (doc.customFields || []).filter(field => field.label || field.value).map(field => `<span>${esc(field.label || 'Detail')}</span><b>${esc(field.value || '-')}</b>`).join('');
  const sellerLocation = [seller.address, seller.state, seller.country].filter(Boolean).join(', ');
  const clientLocation = [doc.clientAddress, doc.clientCity, doc.clientState, !doc.clientAddress && !doc.clientCity && !doc.clientState ? 'India' : ''].filter(Boolean).join(', ');
  const bank = doc.bankEnabled !== false && doc.bankAccount?.bankName
    ? `<section class="bank"><h3>Bank Details</h3><dl><dt>Account Name</dt><dd>${esc(doc.bankAccount.accountName || seller.name)}</dd><dt>Account Number</dt><dd>${esc(doc.bankAccount.accountNumber || '-')}</dd><dt>IFSC</dt><dd>${esc(doc.bankAccount.ifsc || '-')}</dd><dt>Bank</dt><dd>${esc(doc.bankAccount.bankName)}</dd></dl></section>`
    : '<span></span>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}-${esc(doc.number)}</title><style>
  @page{size:A4 portrait;margin:${pageMargins}}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#232126;font:11px/1.48 Arial,sans-serif}body{background:#fff}.purple{color:#6437c8}.head{display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 7mm;break-inside:avoid;page-break-inside:avoid}.head h1{font-size:25px;font-weight:400;line-height:1.08;margin:0 0 5mm}.head img{width:43mm;max-height:17mm;margin-top:7mm;object-fit:contain;object-position:right}.meta{display:grid;grid-template-columns:auto auto;gap:2.5mm 7mm;align-items:center;font-weight:700}.meta span{color:#7b797d}.parties{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm;margin-bottom:4.5mm;break-inside:avoid;page-break-inside:avoid}.party{min-height:34mm;padding:4mm;background:#f0ebf8;border-radius:1.8mm}.party label{display:block;margin-bottom:2mm;color:#6437c8;font-size:16px;line-height:1.1}.party strong{display:block;font-size:11px;margin-bottom:.8mm}.party p{margin:.35mm 0}.items{width:100%;table-layout:fixed;border-spacing:0;border-collapse:separate}.items col.qty{width:25mm}.items col.rate{width:28mm}.items col.amount{width:31mm}.items thead{display:table-header-group}.items th{padding:2.3mm 3mm;background:#6537c8;color:#fff;font-size:10.5px;text-align:right}.items th:first-child{text-align:left;border-radius:1.7mm 0 0}.items th:last-child{border-radius:0 1.7mm 0 0}.items td{padding:2.2mm 3mm;background:#f0ebf8;vertical-align:top}.items tr:last-child td:first-child{border-radius:0 0 0 1.7mm}.items tr:last-child td:last-child{border-radius:0 0 1.7mm 0}.item-heading{display:grid;grid-template-columns:9mm 1fr;gap:1mm;align-items:start}.item-heading strong{font-weight:400}.detail-block{margin:0;padding:3mm 4mm 3mm 12mm;background:#f0ebf8;line-height:1.55;box-decoration-break:clone;-webkit-box-decoration-break:clone}.detail-block h2,.detail-block h3,.detail-block h4{font-size:11px;margin:2.2mm 0 .7mm;break-after:avoid;page-break-after:avoid}.detail-block p,.detail-block div{margin:0 0 1.6mm}.detail-block ul,.detail-block ol{margin:1mm 0 2mm;padding-left:6mm}.detail-block li{margin:0 0 .7mm}.num{text-align:right;white-space:nowrap}.settlement{display:grid;grid-template-columns:1.25fr .8fr;gap:8mm;align-items:start;margin-top:3mm;break-inside:avoid;page-break-inside:avoid}.bank{min-height:38mm;padding:3.5mm 5mm;background:#f0ebf8;border-radius:1.8mm}.bank h3{margin:0 0 1.5mm;color:#6437c8;font-size:14px;font-weight:400}.bank dl{display:grid;grid-template-columns:1fr 1.15fr;gap:1.2mm 4mm;margin:0}.bank dt{font-weight:700}.bank dd{margin:0}.totals{width:100%;border-collapse:collapse}.totals td{padding:2.2mm 0}.totals td:last-child{text-align:right}.totals .grand td{border-top:1px solid #17151a;border-bottom:1px solid #17151a;font-size:16px;font-weight:800}.words{margin:3mm 0 0;font-size:9px;color:#5d5862;break-inside:avoid;page-break-inside:avoid}.terms{margin-top:4mm;padding:3.5mm 5mm;background:#f8f5fc;border-radius:1.8mm;break-inside:auto;page-break-inside:auto}.terms h3{font-size:13px;font-weight:400;margin:0 0 1.5mm;color:#6437c8}.terms>div{display:grid;grid-template-columns:8mm 1fr;gap:2mm;margin:.8mm 0}.terms>div b{color:#6437c8}.extra{margin-top:4mm;padding:3mm 5mm;border-left:2px solid #6537c8;background:#f8f5fc}.extra h3{margin:0 0 1mm;color:#6437c8}.enquiry{text-align:center;margin-top:5mm;color:#5f5967;break-inside:avoid;page-break-inside:avoid}.sign{text-align:right;margin-top:5mm;break-inside:avoid;page-break-inside:avoid}.sign img{max-width:35mm;max-height:18mm}.footer{position:fixed;left:0;right:0;bottom:-17mm;height:16mm;padding-top:2.5mm;border-top:1px dashed #8995a7;background:#fff}.footrow{display:grid;grid-template-columns:1fr 1.25fr 2.8fr;gap:5mm;align-items:end}.footrow span{color:#74727a;font-size:7.5px}.footrow b{display:block;margin-top:.7mm;font-size:8.5px;color:#171719}.page{display:none}.electron{text-align:center;margin-top:1.5mm;font-size:6.8px;color:#47434d}@media print{html,body{width:auto;height:auto}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><header class="head"><div><h1 class="purple">${esc(title)}</h1><div class="meta"><span>${esc(title)} No</span><b>${esc(doc.number)}</b><span>${esc(title)} Date</span><b>${esc(shortDate(doc.date))}</b>${doc.poNumber ? `<span>PO Number</span><b>${esc(doc.poNumber)}</b>` : ''}${customFields}</div></div><img src="${esc(logo)}" alt="${esc(seller.name)}"></header><div class="parties"><div class="party"><label>Billed By</label><strong>${esc(seller.name)}</strong><p>${esc(sellerLocation)}</p>${seller.gstin ? `<p><b>GSTIN:</b> ${esc(seller.gstin)}</p>` : ''}${seller.pan ? `<p><b>PAN:</b> ${esc(seller.pan)}</p>` : ''}</div><div class="party"><label>Billed To</label><strong>${esc(doc.clientName)}</strong><p>${esc(clientLocation)}</p>${doc.clientGstin ? `<p><b>GSTIN:</b> ${esc(doc.clientGstin)}</p>` : ''}${doc.clientPan ? `<p><b>PAN:</b> ${esc(doc.clientPan)}</p>` : ''}</div></div><table class="items"><colgroup><col><col class="qty"><col class="rate"><col class="amount"></colgroup><thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>${details}${doc.notes || doc.additionalInfo ? `<section class="extra">${doc.notes ? `<h3>Notes</h3>${safeRich(doc.notes)}` : ''}${doc.additionalInfo ? `<h3>Additional Information</h3>${safeRich(doc.additionalInfo)}` : ''}</section>` : ''}<div class="settlement">${bank}<div><table class="totals"><tr><td>Amount</td><td>${currency(totals.items)}</td></tr>${Number(doc.discount || 0) ? `<tr><td>Discounts</td><td>(${currency(totals.discount)})</td></tr>` : ''}${taxRows}${charges}<tr class="grand"><td>Total (INR)</td><td>${currency(totals.grand)}</td></tr></table>${doc.showAmountWords !== false ? `<div class="words">${esc(amountWords(totals.grand))}</div>` : ''}${doc.upiEnabled && doc.upiId ? `<div class="words"><b>UPI:</b> ${esc(doc.upiId)}</div>` : ''}</div></div><section class="terms"><h3>Terms and Conditions</h3>${terms}</section><div class="enquiry">For any enquiry, email ${esc(seller.email)} or call ${esc(seller.phone)}</div>${doc.signature ? `<div class="sign"><img src="${esc(doc.signature)}"><br>Authorised Signatory</div>` : ''}<footer class="footer"><div class="footrow"><div><span>${esc(title)} No</span><b>${esc(doc.number)}</b></div><div><span>${esc(title)} Date</span><b>${esc(shortDate(doc.date))}</b></div><div><span>Billed To</span><b>${esc(doc.clientName)}</b></div><div class="page"></div></div><div class="electron">This is an electronically generated document, no signature is required.</div></footer><script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},300)<\/script></body></html>`;
  const frame = window.document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  window.document.body.appendChild(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
  const printImages = [...frame.contentDocument.images];
  frame.contentWindow.onload = () => {
    const imageReady = printImages.map(image => image.complete && image.naturalWidth
      ? (typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve())
      : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 4000); }));
    Promise.race([Promise.all(imageReady), new Promise(resolve => setTimeout(resolve, 4500))]).finally(() => setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 100));
  };
  const printStyle = frame.contentDocument.createElement('style');
  printStyle.textContent = '.document-content{padding-bottom:18mm;box-decoration-break:clone;-webkit-box-decoration-break:clone}.footer{bottom:0!important}';
  frame.contentDocument.head.appendChild(printStyle);
  const printBody = frame.contentDocument.body;
  const footer = printBody.querySelector('.footer');
  const content = frame.contentDocument.createElement('main');
  content.className = 'document-content';
  [...printBody.children].filter(node => node !== footer && node.tagName !== 'SCRIPT').forEach(node => content.appendChild(node));
  printBody.insertBefore(content, footer);
  setTimeout(() => frame.remove(), 60000);
}

function printBillingDocumentLegacy(doc, billingProfile = {}) {
  const seller = { ...DEFAULT_PROFILE, ...billingProfile, ...(doc.seller || {}) };
  const totals = documentTotals(doc);
  const title = doc.title || typeLabel(doc.kind);
  const profileHasLogo = Object.prototype.hasOwnProperty.call(billingProfile || {}, 'logo');
  const logo = (profileHasLogo ? billingProfile.logo : seller.logo) || `${window.location.origin}/assets/visitinglink-logo-invoice.png`;
  const printSettings = { ...DEFAULT_PRINT_SETTINGS, ...(doc.printSettings || {}) };
  const margin = (key, fallback) => Math.min(28, Math.max(6, Number(printSettings[key]) || fallback));
  const pageMargins = `${margin('marginTop', 12)}mm ${margin('marginRight', 12)}mm ${margin('marginBottom', 15)}mm ${margin('marginLeft', 12)}mm`;
  const intra = !doc.clientState || /^(uttar pradesh|up|u\.p\.?)$/i.test(String(doc.clientState).trim());
  const rows = (doc.items || []).map((item, index) => {
    const amount = item.qty !== '' && item.rate !== '' ? Number(item.qty || 0) * Number(item.rate || 0) : Number(item.amount || 0);
    return `<tr><td class="item"><b>${index + 1}.</b><div><strong>${esc(item.name)}</strong>${item.details ? `<section>${safeRich(item.details)}</section>` : ''}</div></td><td class="num">${esc(item.qty === '' ? '-' : item.qty)}</td><td class="num">${item.rate === '' ? '-' : rupee(item.rate)}</td><td class="num">${rupee(amount)}</td></tr>`;
  }).join('');
  const taxRows = Number(doc.gstRate || 0) > 0 ? (intra
    ? `<tr><td>CGST (${Number(doc.gstRate) / 2}%) + SGST (${Number(doc.gstRate) / 2}%)</td><td>${rupee(totals.gst)}</td></tr>`
    : `<tr><td>IGST (${Number(doc.gstRate)}%)</td><td>${rupee(totals.gst)}</td></tr>`) : '';
  const charges = (doc.additionalCharges || []).filter(charge => Number(charge.amount || 0)).map(charge => `<tr><td>${esc(charge.label || 'Additional charge')}</td><td>${rupee(charge.amount)}</td></tr>`).join('');
  const terms = termsOf(doc).map((term, index) => `<div>${index + 1}. ${esc(plain(term.text))}</div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}-${esc(doc.number)}</title><style>
  @page{size:A4 portrait;margin:${pageMargins}}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#1b1b1f;font:10.5px/1.5 Arial,sans-serif}body{border-top:3px solid #6537c4;padding-top:5mm;background:#fff}.purple{color:#6537c4}.head{display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 6mm;break-inside:avoid;page-break-inside:avoid}.head h1{font-size:25px;line-height:1.1;margin:0 0 4mm}.meta{display:grid;grid-template-columns:auto auto;gap:2px 20px;padding:3mm 4mm;border:1px solid #e0d8ec;border-radius:2mm;font-weight:700}.meta span{color:#77727f;font-size:9px}.head img{width:42mm;max-height:16mm;object-fit:contain;object-position:right}.parties{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:5mm;break-inside:avoid;page-break-inside:avoid}.party{min-height:29mm;padding:4mm;border:1px solid #ddd3eb;border-top:2.5px solid #6537c4;background:#f7f3fb;border-radius:2mm}.party label{display:block;margin-bottom:2mm;color:#6537c4;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.party strong{display:block;font-size:12px;margin-bottom:1.5mm}.party p{margin:.8mm 0;color:#4f4b55}.items{width:100%;border-spacing:0;border-collapse:separate}.items thead{display:table-header-group}.items th{padding:2.8mm 2.5mm;background:#6537c4;color:#fff;font-size:10px;text-align:right}.items th:first-child{text-align:left;border-radius:1.5mm 0 0}.items th:last-child{border-radius:0 1.5mm 0 0}.items td{padding:3mm 2.5mm;border-bottom:1px solid #e2daed;background:#fff;vertical-align:top}.items .item{display:flex;gap:3mm;width:auto}.items .item>b{color:#6537c4}.items .item>div{min-width:0}.items .item strong{font-size:11px}.items section{margin-top:2mm;padding:2.5mm 3mm;border-left:2px solid #6537c4;background:#f7f3fb;line-height:1.52}.items section h2,.items section h3,.items section h4{font-size:11px;margin:3mm 0 1.5mm;padding-top:1.5mm;border-top:1px solid #c9b9e1;break-after:avoid;page-break-after:avoid}.items section h2:first-child,.items section h3:first-child,.items section h4:first-child{margin-top:0;padding-top:0;border-top:0}.items section p,.items section div{margin:0 0 2mm}.items section ul,.items section ol{margin:1.5mm 0;padding-left:6mm}.items section li{margin:0 0 1.2mm;break-inside:avoid;page-break-inside:avoid}.num{text-align:right;white-space:nowrap;font-weight:700}.totals{width:76mm;margin:5mm 0 0 auto;border-collapse:collapse;break-inside:avoid;page-break-inside:avoid}.totals td{padding:2.5mm;border-bottom:1px solid #e2daed}.totals td:last-child{text-align:right;font-weight:700}.totals .grand td{border:0;background:#6537c4;color:#fff;font-size:13px;font-weight:800}.words{display:flex;justify-content:space-between;align-items:flex-start;margin-top:3mm;gap:5mm;break-inside:avoid;page-break-inside:avoid}.words>div:first-child{max-width:105mm;padding-top:2mm;color:#57525e}.boxed{display:grid;grid-template-columns:1fr 1.1fr;min-width:70mm;border:1px solid #6537c4}.boxed b{padding:2.5mm}.boxed b+ b{border-left:1px solid #6537c4;text-align:right}.terms{margin-top:5mm;padding-top:4mm;border-top:1px solid #ddd3eb;line-height:1.6}.terms h3{font-size:12px;margin:0 0 1.5mm;color:#6537c4;break-after:avoid;page-break-after:avoid}.terms>div{break-inside:avoid;page-break-inside:avoid}.enquiry{text-align:center;margin-top:7mm;color:#5f5967;break-inside:avoid;page-break-inside:avoid}.payment{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm;break-inside:avoid;page-break-inside:avoid}.payment>div{padding:3.5mm;border:1px solid #ddd3eb;border-radius:2mm}.payment h3{margin:0 0 2mm;color:#6537c4}.sign{text-align:right;margin-top:6mm;break-inside:avoid;page-break-inside:avoid}.sign img{max-width:35mm;max-height:18mm}.footer{position:static;margin-top:8mm;padding:3.5mm 0 1mm;border-top:1px dashed #aaa4b4;background:#fff;break-inside:avoid;page-break-inside:avoid}.footrow{display:grid;grid-template-columns:1fr 1.15fr 2.5fr;gap:5mm;align-items:end}.footrow span{color:#8b8993;font-size:8px}.footrow b{display:block;margin-top:1mm;font-size:9.5px;color:#171719}.footlogo{width:31mm;text-align:right}.electron{margin-top:2.5mm;color:#9896a0;font-size:8px}.page{display:none}@media print{html,body{width:auto;height:auto}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.items tr{break-inside:auto;page-break-inside:auto}}
  </style></head><body><header class="head"><div><h1 class="purple">${esc(title)}</h1><div class="meta"><span>${esc(title)} No #</span><b>${esc(doc.number)}</b><span>${esc(title)} Date</span><b>${esc(shortDate(doc.date))}</b>${doc.poNumber ? `<span>PO Number</span><b>${esc(doc.poNumber)}</b>` : ''}</div></div><img src="${esc(logo)}" alt="${esc(seller.name)}"></header><div class="parties"><div class="party"><label>Billed By</label><strong>${esc(seller.name)}</strong><p>${esc(seller.address)}</p><p>${esc([seller.state, seller.country].filter(Boolean).join(', '))}</p>${seller.gstin ? `<p>GSTIN ${esc(seller.gstin)}</p>` : ''}</div><div class="party"><label>Billed To</label><strong>${esc(doc.clientName)}</strong><p>${esc(doc.clientAddress || '')}</p><p>${esc([doc.clientCity, doc.clientState, !doc.clientCity && !doc.clientState ? 'India' : ''].filter(Boolean).join(', '))}</p>${doc.clientGstin ? `<p>GSTIN ${esc(doc.clientGstin)}</p>` : ''}</div></div><table class="items"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><table class="totals">${Number(doc.discount || 0) ? `<tr><td>Discounts</td><td>(${rupee(totals.discount)})</td></tr>` : ''}${taxRows}${charges}<tr class="grand"><td>Total</td><td>${rupee(totals.grand)}</td></tr></table>${doc.showAmountWords !== false ? `<div class="words"><div>Total (in words) : ${esc(amountWords(totals.grand))}</div><div class="boxed"><b>Total (INR)</b><b>${rupee(totals.grand)}</b></div></div>` : ''}${doc.bankEnabled !== false && doc.bankAccount?.bankName || doc.upiEnabled && doc.upiId ? `<div class="payment">${doc.bankEnabled !== false && doc.bankAccount?.bankName ? `<div><h3>Bank Account</h3><b>${esc(doc.bankAccount.accountName || seller.name)}</b><br>${esc(doc.bankAccount.bankName)} · ${esc(doc.bankAccount.accountNumber)}<br>IFSC ${esc(doc.bankAccount.ifsc)}</div>` : '<span></span>'}${doc.upiEnabled && doc.upiId ? `<div><h3>UPI Details</h3>${esc(doc.upiId)}</div>` : ''}</div>` : ''}<div class="terms">${doc.notes ? `<h3>Notes</h3><div>${safeRich(doc.notes)}</div>` : ''}<h3>Terms and Conditions</h3>${terms}</div><div class="enquiry">For any enquiry, reach out via email at ${esc(seller.email)}, call on ${esc(seller.phone)}</div>${doc.signature ? `<div class="sign"><img src="${esc(doc.signature)}"><br>Authorised Signatory</div>` : ''}<footer class="footer"><div class="footrow"><div><span>${esc(title)} No</span><b>${esc(doc.number)}</b></div><div><span>${esc(title)} Date</span><b>${esc(shortDate(doc.date))}</b></div><div><span>Billed To</span><b>${esc(doc.clientName)}</b></div><div class="page"></div></div><div class="electron">This is an electronically generated document, no signature is required.</div></footer><script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},300)<\/script></body></html>`;
  const frame = window.document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  window.document.body.appendChild(frame);
  frame.contentDocument.open(); frame.contentDocument.write(html); frame.contentDocument.close();
  setTimeout(() => frame.remove(), 60000);
}

function RichEditor({ value, onChange, placeholder = 'Write details here…' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== String(value || '')) ref.current.innerHTML = String(value || ''); }, [value]);
  const command = (name, input) => { ref.current?.focus(); window.document.execCommand(name, false, input); onChange(ref.current?.innerHTML || ''); };
  return <div className="bill-rte-wrap"><div className="bill-rte-toolbar"><button type="button" onClick={() => command('bold')}><b>B</b></button><button type="button" onClick={() => command('italic')}><i>I</i></button><button type="button" onClick={() => command('strikeThrough')}><s>S</s></button><button type="button" onClick={() => command('insertUnorderedList')}>• List</button><button type="button" onClick={() => command('insertOrderedList')}>1. List</button><button type="button" onClick={() => command('formatBlock', 'h3')}>Heading</button></div><div ref={ref} className="bill-rte" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={event => onChange(event.currentTarget.innerHTML)} /></div>;
}

function UploadControl({ label, value, onChange, onUpload, accept = 'image/*' }) {
  const [busy, setBusy] = useState(false);
  async function choose(file) { if (!file) return; setBusy(true); try { await onChange(await onUpload(file)); } catch { /* parent toast handles this */ } finally { setBusy(false); } }
  return <label className="bill-upload"><span>{value ? '✓' : '＋'} {busy ? 'Uploading…' : label}</span><input type="file" accept={accept} disabled={busy} onChange={event => choose(event.target.files?.[0])} /></label>;
}

function BillIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'view') return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
  if (name === 'edit') return <svg {...common}><path d="M13.5 6.5 17.5 10.5" /><path d="M4 20l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Z" /></svg>;
  if (name === 'duplicate') return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  if (name === 'delete') return <svg {...common}><path d="M4 7h16" /><path d="M9 3h6l1 4H8l1-4Z" /><path d="m7 7 1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></svg>;
  if (name === 'payment') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 7h6M9 10h6M10 7c4 0 4 5 0 5h-1l6 5" /></svg>;
  return <svg {...common}><path d="M5 3h8l4 4v5" /><path d="M13 3v5h5" /><path d="M5 3v18h7" /><path d="M14 17h7M18 13l4 4-4 4" /></svg>;
}

export function BillingEditor({ document: source, data, initialKind = 'invoice', leadId = '', onClose, onSave, onDelete, onSaveProfile, onUpload, notify }) {
  const linkedLead = data.leads.find(lead => lead.id === (source?.leadId || leadId));
  const kind = source?.kind || initialKind;
  const draftKey = `visitinglink-billing-draft-${source?.id || kind}`;
  const base = {
    id: source?.id || uid('bill'), kind, title: typeLabel(kind), subtitle: '', number: nextNumber(data.documents, kind), poNumber: '', date: today(), dueDate: '', customFields: [],
    seller: { ...DEFAULT_PROFILE, ...(data.billingProfile || {}) },
    clientName: linkedLead?.company || linkedLead?.name || '', clientAddress: '', clientCity: linkedLead?.city || '', clientState: linkedLead?.state || '', clientGstin: '', clientPan: '', clientPhone: linkedLead?.phone || '', clientEmail: '', leadId: linkedLead?.id || '',
    items: linkedLead?.service ? [{ ...EMPTY_LINE(), name: linkedLead.service, amount: Number(linkedLead.deal || linkedLead.quote || 0) || '' }] : [EMPTY_LINE()],
    discount: 0, additionalCharges: [], gstRate: 18, gstMode: 'exclusive', paid: 0, status: 'draft', notes: '', additionalInfo: '', contactDetails: '', termRows: DEFAULT_TERMS.map(text => ({ id: uid('term'), text, group: '' })),
    bankEnabled: data.billingProfile?.bankEnabled !== false, bankAccount: { accountName: '', bankName: '', accountNumber: '', ifsc: '', ...(data.billingProfile?.bankAccount || {}) }, upiEnabled: Boolean(data.billingProfile?.upiEnabled), upiId: data.billingProfile?.upiId || '', signature: '', attachments: [], showAmountWords: true,
    recurring: false, recurringInterval: 'monthly', printSettings: { ...DEFAULT_PRINT_SETTINGS }, advanced: { showHsn: true, showUnit: true, showImages: false, fullWidthDescription: true, summariseQuantity: false }, createdAt: new Date().toISOString(),
  };
  const [form, setForm] = useState(() => {
    let draft = null;
    if (!source && typeof window !== 'undefined') { try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { draft = null; } }
    const saved = draft || source || {};
    return {
      ...base, ...saved,
      seller: { ...base.seller, ...(saved.seller || {}), logo: Object.prototype.hasOwnProperty.call(data.billingProfile || {}, 'logo') ? data.billingProfile.logo : (saved.seller?.logo || base.seller.logo) }, bankAccount: { ...base.bankAccount, ...(saved.bankAccount || {}) }, printSettings: { ...base.printSettings, ...(saved.printSettings || {}), theme: 'reference' }, advanced: { ...base.advanced, ...(saved.advanced || {}) },
      items: (saved.items?.length ? saved.items : base.items).map(item => ({ ...EMPTY_LINE(), ...item, id: item.id || uid('line') })), termRows: termsOf(saved),
    };
  });
  const [leadQuery, setLeadQuery] = useState(linkedLead ? [linkedLead.company || linkedLead.name || linkedLead.phone, linkedLead.phone].filter(Boolean).join(' · ') : '');
  const [saving, setSaving] = useState(false);
  const [editSeller, setEditSeller] = useState(false);
  const [editClient, setEditClient] = useState(!form.clientName);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setSeller = (key, value) => setForm(current => ({ ...current, seller: { ...current.seller, [key]: value } }));
  const setBank = (key, value) => setForm(current => ({ ...current, bankAccount: { ...current.bankAccount, [key]: value } }));
  const setAdvanced = (key, value) => setForm(current => ({ ...current, advanced: { ...current.advanced, [key]: value } }));
  const setPrintSetting = (key, value) => setForm(current => ({ ...current, printSettings: { ...current.printSettings, [key]: value } }));
  const totals = documentTotals(form);

  useEffect(() => {
    if (source) return undefined;
    const timer = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(form)), 400);
    return () => clearTimeout(timer);
  }, [draftKey, form, source]);

  const leadResults = data.leads.filter(lead => {
    const query = leadQuery.trim().toLowerCase(); const number = query.replace(/\D/g, '');
    return query && ([lead.company, lead.name, lead.phone, lead.city, lead.service].join(' ').toLowerCase().includes(query) || (number.length >= 3 && String(lead.phone || '').replace(/\D/g, '').includes(number)));
  }).slice(0, 8);
  function pickLead(id) { const lead = data.leads.find(item => item.id === id); if (!lead) return; setLeadQuery([lead.company || lead.name || lead.phone, lead.phone].filter(Boolean).join(' · ')); setForm(current => ({ ...current, leadId: id, clientName: lead.company || lead.name || '', clientCity: lead.city || '', clientState: lead.state || current.clientState, clientPhone: lead.phone || '', items: current.items.some(item => item.name || item.amount) ? current.items : [{ ...EMPTY_LINE(), name: lead.service || '', amount: Number(lead.deal || lead.quote || 0) || '' }] })); }
  function updateLine(id, key, value) { setForm(current => ({ ...current, items: current.items.map(item => { if (item.id !== id) return item; const next = { ...item, [key]: value }; if (['qty', 'rate'].includes(key) && next.qty !== '' && next.rate !== '') next.amount = Math.round(Number(next.qty || 0) * Number(next.rate || 0) * 100) / 100; return next; }) })); }
  function move(rows, key, index, delta) { const target = index + delta; if (target < 0 || target >= rows.length) return; const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; set(key, next); }
  function changeKind(nextKind) { setForm(current => ({ ...current, kind: nextKind, title: current.title === typeLabel(current.kind) ? typeLabel(nextKind) : current.title, number: nextNumber(data.documents.filter(doc => doc.id !== current.id), nextKind), paid: isInvoice(nextKind) ? current.paid : 0 })); }
  function closeEditor() { if (!source) localStorage.setItem(draftKey, JSON.stringify(form)); onClose(); }
  async function submit(printAfter = false) {
    if (saving) return;
    if (!form.clientName.trim()) return notify('Enter billed-to name');
    const items = form.items.filter(item => item.name.trim() || plain(item.details) || Number(item.amount || 0));
    if (!items.length) return notify('Add at least one item');
    const doc = {
      ...form, title: form.title || typeLabel(form.kind), date: form.date || today(), discount: Number(form.discount || 0), gstRate: Number(form.gstRate || 0), paid: Number(form.paid || 0), updatedAt: new Date().toISOString(),
      terms: form.termRows.map((term, index) => `${index + 1}. ${plain(term.text)}`).join('\n'),
      items: items.map(item => ({ ...item, qty: item.qty === '' ? '' : Number(item.qty), rate: item.rate === '' ? '' : Number(item.rate), amount: Number(item.amount || 0), gstRate: item.gstRate === '' ? '' : Number(item.gstRate) })),
      additionalCharges: (form.additionalCharges || []).map(charge => ({ ...charge, amount: Number(charge.amount || 0) })),
    };
    setSaving(true); const ok = await onSave(doc, { keepOpen: printAfter }); setSaving(false);
    if (ok) { localStorage.removeItem(draftKey); if (printAfter) printBillingDocument(doc, data.billingProfile); }
  }
  async function saveDefaultCompany() { const ok = await onSaveProfile({ ...(data.billingProfile || {}), ...form.seller }, { keepOpen: true }); if (ok) notify('Company details saved as default'); }
  async function saveCompanyLogo(value) {
    setSeller('logo', value);
    const ok = await onSaveProfile({ ...(data.billingProfile || {}), logo: value }, { keepOpen: true });
    if (ok) notify(value ? 'Company logo saved for every PDF' : 'Company logo removed; default logo will be used');
  }
  async function saveDefaultBank() {
    if (!String(form.bankAccount.bankName || '').trim() || !String(form.bankAccount.accountNumber || '').trim()) return notify('Enter bank name and account number first');
    const profile = { ...(data.billingProfile || {}), ...form.seller, bankEnabled: form.bankEnabled, bankAccount: { ...form.bankAccount }, upiEnabled: form.upiEnabled, upiId: form.upiId };
    const ok = await onSaveProfile(profile, { keepOpen: true });
    if (ok) notify('Bank details saved for future documents');
  }

  return <section className="page active billing-studio" id="billing-editor">
    <div className="bill-studio-head"><button className="bill-back" type="button" onClick={closeEditor}>← Bills</button><div><span>{source ? 'Editing saved document' : 'New document · autosaved'}</span><strong>{form.title} #{form.number}</strong></div><div className="bill-studio-actions">{source && <Button variant="danger" onClick={() => onDelete(source)}>Delete</Button>}<Button disabled={saving} onClick={() => submit(true)}>Save & PDF</Button><Button variant="primary" disabled={saving} onClick={() => submit(false)}>{saving ? 'Saving…' : 'Save document'}</Button></div></div>
    <div className="bill-studio-page">
      <div className="bill-paper-kicker"><span>Document editor</span><strong>{typeLabel(form.kind)} · #{form.number}</strong></div>
      <header className="bill-document-title">
        <div className="bill-type-picker"><label>Document type</label><select value={form.kind} onChange={event => changeKind(event.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="bill-title-fields"><input className="bill-title-input" value={form.title} onChange={event => set('title', event.target.value)} aria-label="Document heading" /><input className="bill-subtitle-input" value={form.subtitle} onChange={event => set('subtitle', event.target.value)} placeholder="＋ Add subtitle (optional)" /></div>
        <span className="bill-title-spacer" />
      </header>
      <div className="bill-upper-grid">
        <section className="bill-meta-panel">
          <div className="bill-meta-grid"><Field label="Document No."><input value={form.number} onChange={event => set('number', event.target.value)} /></Field><Field label="PO Number"><input value={form.poNumber} onChange={event => set('poNumber', event.target.value)} placeholder="Optional" /></Field><Field label="Document Date"><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></Field><Field label="Due Date"><input type="date" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} /></Field></div>
          <button className="bill-add-link" type="button" onClick={() => set('customFields', [...(form.customFields || []), { id: uid('field'), label: '', value: '' }])}>＋ Add custom field</button>
          {!!form.customFields?.length && <div className="bill-custom-fields">{form.customFields.map(field => <div key={field.id}><input value={field.label} placeholder="Field name" onChange={event => set('customFields', form.customFields.map(item => item.id === field.id ? { ...item, label: event.target.value } : item))} /><input value={field.value} placeholder="Value" onChange={event => set('customFields', form.customFields.map(item => item.id === field.id ? { ...item, value: event.target.value } : item))} /><button type="button" onClick={() => set('customFields', form.customFields.filter(item => item.id !== field.id))}>×</button></div>)}</div>}
        </section>
        <aside className="bill-logo-panel">
          <div className="bill-logo-preview"><img src={form.seller.logo || '/assets/visitinglink-logo-invoice.png'} alt={form.seller.name || 'Company logo'} /></div>
          <UploadControl label={form.seller.logo ? 'Change logo' : 'Upload logo'} value={form.seller.logo} onChange={saveCompanyLogo} onUpload={onUpload} />
          {form.seller.logo && <button className="bill-remove-logo" type="button" onClick={() => saveCompanyLogo('')}>Remove logo</button>}
        </aside>
      </div>

      <div className="bill-parties">
        <section className="bill-party"><div className="bill-section-head"><div><h2>Billed By</h2><span>Your company details</span></div><button type="button" onClick={() => setEditSeller(value => !value)}>{editSeller ? 'Done' : 'Edit'}</button></div>{editSeller ? <div className="bill-party-form"><input value={form.seller.name} onChange={event => setSeller('name', event.target.value)} placeholder="Company name" /><input value={form.seller.address} onChange={event => setSeller('address', event.target.value)} placeholder="Address" /><input value={form.seller.state} onChange={event => setSeller('state', event.target.value)} placeholder="State" /><input value={form.seller.country} onChange={event => setSeller('country', event.target.value)} placeholder="Country" /><input value={form.seller.gstin} onChange={event => setSeller('gstin', event.target.value)} placeholder="GSTIN" /><input value={form.seller.pan} onChange={event => setSeller('pan', event.target.value)} placeholder="PAN" /><input value={form.seller.email} onChange={event => setSeller('email', event.target.value)} placeholder="Email" /><input value={form.seller.phone} onChange={event => setSeller('phone', event.target.value)} placeholder="Phone" /><button className="btn" type="button" onClick={saveDefaultCompany}>Save as company default</button></div> : <div className="bill-party-preview"><strong>{form.seller.name}</strong><p>{form.seller.address}</p><p>{[form.seller.state, form.seller.country].filter(Boolean).join(', ')}</p><p>{form.seller.gstin && `GSTIN ${form.seller.gstin}`}{form.seller.pan && ` · PAN ${form.seller.pan}`}</p></div>}</section>
        <section className="bill-party"><div className="bill-section-head"><div><h2>Billed To</h2><span>Client details</span></div><button type="button" onClick={() => setEditClient(value => !value)}>{editClient ? 'Done' : 'Edit'}</button></div><div className="billing-lead-search"><input value={leadQuery} placeholder="Search saved client / lead" onChange={event => { setLeadQuery(event.target.value); set('leadId', ''); }} />{leadQuery && !form.leadId && leadResults.length > 0 && <div>{leadResults.map(lead => <button type="button" key={lead.id} onClick={() => pickLead(lead.id)}>{lead.company || lead.name || lead.phone} · {lead.phone}</button>)}</div>}</div>{editClient ? <div className="bill-party-form"><input value={form.clientName} onChange={event => set('clientName', event.target.value)} placeholder="Client / company name" /><input value={form.clientAddress} onChange={event => set('clientAddress', event.target.value)} placeholder="Address" /><input value={form.clientCity} onChange={event => set('clientCity', event.target.value)} placeholder="City" /><input value={form.clientState} onChange={event => set('clientState', event.target.value)} placeholder="State" /><input value={form.clientGstin} onChange={event => set('clientGstin', event.target.value)} placeholder="GSTIN" /><input value={form.clientPan} onChange={event => set('clientPan', event.target.value)} placeholder="PAN" /><input value={form.clientPhone} onChange={event => set('clientPhone', event.target.value)} placeholder="Phone" /><input value={form.clientEmail} onChange={event => set('clientEmail', event.target.value)} placeholder="Email" /></div> : <div className="bill-party-preview"><strong>{form.clientName}</strong><p>{form.clientAddress}</p><p>{[form.clientCity, form.clientState].filter(Boolean).join(', ')}</p><p>{form.clientGstin && `GSTIN ${form.clientGstin}`}{form.clientPan && ` · PAN ${form.clientPan}`}</p><p>{form.clientPhone}</p></div>}</section>
      </div>
      <div className="bill-config-row"><Field label="Currency"><select value="INR" readOnly><option>Indian Rupee (INR, ₹)</option></select></Field><Field label="GST"><select value={form.gstRate} onChange={event => set('gstRate', event.target.value)}><option value="0">No GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></Field><Field label="Tax mode"><select value={form.gstMode} onChange={event => set('gstMode', event.target.value)}><option value="exclusive">GST added on top</option><option value="inclusive">GST included in price</option></select></Field></div>

      <section className="bill-items-section"><div className="bill-items-head"><span>Item</span><span>HSN/SAC</span><span>GST</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span><span /></div>{form.items.map((item, index) => <article className="bill-item-row" key={item.id}><div className="bill-item-number">{index + 1}</div><input className="bill-item-name" value={item.name} placeholder="Item / service" onChange={event => updateLine(item.id, 'name', event.target.value)} /><input value={item.hsn} placeholder="HSN" onChange={event => updateLine(item.id, 'hsn', event.target.value)} /><select value={item.gstRate === '' ? form.gstRate : item.gstRate} onChange={event => updateLine(item.id, 'gstRate', event.target.value)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select><input type="number" min="0" value={item.qty} onChange={event => updateLine(item.id, 'qty', event.target.value)} /><select value={item.unit} onChange={event => updateLine(item.id, 'unit', event.target.value)}><option>Unit</option><option>Page</option><option>Hour</option><option>Day</option><option>Month</option><option>Project</option></select><input type="number" min="0" value={item.rate} placeholder="Rate" onChange={event => updateLine(item.id, 'rate', event.target.value)} /><input type="number" min="0" value={item.amount} placeholder="Amount" onChange={event => updateLine(item.id, 'amount', event.target.value)} /><button className="bill-remove" type="button" onClick={() => set('items', form.items.filter(line => line.id !== item.id))}>×</button><div className="bill-item-editor"><RichEditor value={item.details} onChange={value => updateLine(item.id, 'details', value)} placeholder="Scope of work, headings, bullet points and item details…" /><div className="bill-item-tools"><UploadControl label="Add image" value={item.image} onChange={value => updateLine(item.id, 'image', value)} onUpload={onUpload} /><button type="button" onClick={() => move(form.items, 'items', index, -1)}>↑ Move</button><button type="button" onClick={() => move(form.items, 'items', index, 1)}>↓ Move</button><button type="button" onClick={() => set('items', [...form.items.slice(0, index + 1), { ...item, id: uid('line') }, ...form.items.slice(index + 1)])}>Duplicate</button></div></div></article>)}<div className="bill-line-actions"><button type="button" onClick={() => set('items', [...form.items, EMPTY_LINE()])}>＋ Add New Line</button><button type="button" onClick={() => { const group = window.prompt('Group name'); if (group) set('items', [...form.items, { ...EMPTY_LINE(group), name: group }]); }}>＋ Add New Group</button></div></section>

      <div className="bill-payment-layout">
        <div className="bill-payment-left"><section className="bill-option-card"><label className="bill-switch"><input type="checkbox" checked={form.bankEnabled} onChange={event => set('bankEnabled', event.target.checked)} /><span />Show Bank Account Details</label>{form.bankEnabled && <><div className="bill-bank-grid"><input value={form.bankAccount.accountName} onChange={event => setBank('accountName', event.target.value)} placeholder="Account name" /><input value={form.bankAccount.bankName} onChange={event => setBank('bankName', event.target.value)} placeholder="Bank name" /><input value={form.bankAccount.accountNumber} onChange={event => setBank('accountNumber', event.target.value)} placeholder="Account number" /><input value={form.bankAccount.ifsc} onChange={event => setBank('ifsc', event.target.value)} placeholder="IFSC" /></div><div className="bill-bank-save-row"><span>{data.billingProfile?.bankAccount?.accountNumber ? 'Saved bank details are loaded automatically.' : 'Save once and reuse in every new document.'}</span><button type="button" onClick={saveDefaultBank}>Save for future</button></div></>}</section><section className="bill-option-card"><label className="bill-switch"><input type="checkbox" checked={form.upiEnabled} onChange={event => set('upiEnabled', event.target.checked)} /><span />Add UPI Details</label>{form.upiEnabled && <input value={form.upiId} onChange={event => set('upiId', event.target.value)} placeholder="UPI ID" />}</section></div>
        <aside className="bill-total-card"><div><span>Amount</span><strong>{rupee(totals.items)}</strong></div><div><span>Discount</span><input type="number" min="0" value={form.discount} onChange={event => set('discount', event.target.value)} /></div><div><span>GST</span><strong>{rupee(totals.gst)}</strong></div>{(form.additionalCharges || []).map(charge => <div className="bill-charge" key={charge.id}><input value={charge.label} onChange={event => set('additionalCharges', form.additionalCharges.map(item => item.id === charge.id ? { ...item, label: event.target.value } : item))} /><input type="number" value={charge.amount} onChange={event => set('additionalCharges', form.additionalCharges.map(item => item.id === charge.id ? { ...item, amount: event.target.value } : item))} /><button type="button" onClick={() => set('additionalCharges', form.additionalCharges.filter(item => item.id !== charge.id))}>×</button></div>)}<button className="bill-add-link" type="button" onClick={() => set('additionalCharges', [...(form.additionalCharges || []), { id: uid('charge'), label: 'Additional charge', amount: '' }])}>＋ Add Additional Charges</button><div className="bill-grand"><span>Total (INR)</span><strong>{rupee(totals.grand)}</strong></div><label className="bill-check"><input type="checkbox" checked={form.showAmountWords} onChange={event => set('showAmountWords', event.target.checked)} /> Show total in words</label>{form.showAmountWords && <p>{amountWords(totals.grand)}</p>}{isInvoice(form.kind) && <div><span>Amount received</span><input type="number" min="0" value={form.paid} onChange={event => set('paid', event.target.value)} /></div>}</aside>
      </div>

      <section className="bill-extras"><div className="bill-extra-grid"><div><h3>Notes</h3><RichEditor value={form.notes} onChange={value => set('notes', value)} /></div><div><h3>Additional Info</h3><RichEditor value={form.additionalInfo} onChange={value => set('additionalInfo', value)} /></div><div><h3>Contact Details</h3><textarea value={form.contactDetails} onChange={event => set('contactDetails', event.target.value)} placeholder="Alternate contact / project owner" /></div><div><h3>Attachments</h3><UploadControl label="Upload attachment" value={form.attachments?.length} onChange={url => set('attachments', [...(form.attachments || []), { id: uid('attachment'), name: url.split('/').pop(), url }])} onUpload={onUpload} accept="image/*,.pdf" />{(form.attachments || []).map(file => <p key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a> <button type="button" onClick={() => set('attachments', form.attachments.filter(item => item.id !== file.id))}>×</button></p>)}</div></div><div className="bill-signature"><h3>Signature</h3><UploadControl label={form.signature ? 'Change signature' : 'Add signature'} value={form.signature} onChange={value => set('signature', value)} onUpload={onUpload} />{form.signature && <img src={form.signature} alt="Signature" />}</div></section>

      <section className="bill-terms"><div className="bill-section-head"><div><h2>Terms and Conditions</h2><span>Editable and reorderable</span></div></div>{form.termRows.map((term, index) => <div className="bill-term" key={term.id}><b>{String(index + 1).padStart(2, '0')}</b><input value={term.text} onChange={event => set('termRows', form.termRows.map(item => item.id === term.id ? { ...item, text: event.target.value } : item))} /><button type="button" onClick={() => move(form.termRows, 'termRows', index, -1)}>↑</button><button type="button" onClick={() => move(form.termRows, 'termRows', index, 1)}>↓</button><button type="button" onClick={() => set('termRows', form.termRows.filter(item => item.id !== term.id))}>×</button></div>)}<div className="bill-line-actions"><button type="button" onClick={() => set('termRows', [...form.termRows, { id: uid('term'), text: '', group: '' }])}>＋ Add New Term</button><button type="button" onClick={() => { const group = window.prompt('Term group name'); if (group) set('termRows', [...form.termRows, { id: uid('term'), text: group, group }]); }}>＋ Add New Group</button></div></section>

      <section className="bill-bottom-options">
        <div className="bill-print-settings-head"><div><h3>PDF page & margins</h3><p>These margins are saved with the document and applied directly to the A4 output.</p></div><Field label="Theme"><select value="reference" disabled><option value="reference">Visitinglink reference</option></select></Field></div>
        <div className="bill-margin-grid"><Field label="Top (mm)"><input type="number" min="6" max="28" value={form.printSettings.marginTop} onChange={event => setPrintSetting('marginTop', event.target.value)} /></Field><Field label="Right (mm)"><input type="number" min="6" max="28" value={form.printSettings.marginRight} onChange={event => setPrintSetting('marginRight', event.target.value)} /></Field><Field label="Bottom (mm)"><input type="number" min="6" max="28" value={form.printSettings.marginBottom} onChange={event => setPrintSetting('marginBottom', event.target.value)} /></Field><Field label="Left (mm)"><input type="number" min="6" max="28" value={form.printSettings.marginLeft} onChange={event => setPrintSetting('marginLeft', event.target.value)} /></Field></div>
        <div className="bill-margin-note"><b>Recommended A4:</b> 12 mm top · 10 mm right · 22 mm bottom · 10 mm left. The table heading repeats automatically and the fixed footer stays inside its reserved bottom margin.</div>
        <label className="bill-switch"><input type="checkbox" checked={form.recurring} onChange={event => set('recurring', event.target.checked)} /><span />This is a recurring {typeLabel(form.kind).toLowerCase()}</label>{form.recurring && <select value={form.recurringInterval} onChange={event => set('recurringInterval', event.target.value)}><option value="monthly">Every month</option><option value="quarterly">Every quarter</option><option value="yearly">Every year</option></select>}
        <h3>Advanced options</h3><div className="bill-advanced-grid"><label><input type="checkbox" checked={form.advanced.showHsn} onChange={event => setAdvanced('showHsn', event.target.checked)} /> Show HSN/SAC column</label><label><input type="checkbox" checked={form.advanced.showUnit} onChange={event => setAdvanced('showUnit', event.target.checked)} /> Display unit</label><label><input type="checkbox" checked={form.advanced.showImages} onChange={event => setAdvanced('showImages', event.target.checked)} /> Show item images</label><label><input type="checkbox" checked={form.advanced.fullWidthDescription} onChange={event => setAdvanced('fullWidthDescription', event.target.checked)} /> Description in full width</label><label><input type="checkbox" checked={form.advanced.summariseQuantity} onChange={event => setAdvanced('summariseQuantity', event.target.checked)} /> Summarise total quantity</label></div><div className="bill-status-row"><Field label="Document status"><select value={form.status} onChange={event => set('status', event.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></Field></div>
      </section>
    </div>
    <div className="bill-mobile-save"><Button disabled={saving} onClick={() => submit(true)}>Save & PDF</Button><Button variant="primary" disabled={saving} onClick={() => submit(false)}>Save</Button></div>
  </section>;
}

export function BillingProfileEditor({ profile, onClose, onSave, onUpload }) {
  const [form, setForm] = useState({ ...DEFAULT_PROFILE, ...(profile || {}) });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <Modal title="Company billing profile" subtitle="Default details and logo for every PDF" onClose={onClose} footer={<><span /><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(form)}>Save</Button></div></>}><div className="bill-logo-panel bill-profile-logo"><div className="bill-logo-preview"><img src={form.logo || '/assets/visitinglink-logo-invoice.png'} alt={form.name || 'Company logo'} /></div><UploadControl label={form.logo ? 'Change logo' : 'Upload logo'} value={form.logo} onChange={value => set('logo', value)} onUpload={onUpload} />{form.logo && <button className="bill-remove-logo" type="button" onClick={() => set('logo', '')}>Remove logo</button>}</div><div className="form form-grid"><Field label="Company name"><input value={form.name} onChange={event => set('name', event.target.value)} /></Field><Field label="GSTIN"><input value={form.gstin} onChange={event => set('gstin', event.target.value)} /></Field><Field label="PAN"><input value={form.pan} onChange={event => set('pan', event.target.value)} /></Field><Field label="State"><input value={form.state} onChange={event => set('state', event.target.value)} /></Field><Field label="Country"><input value={form.country} onChange={event => set('country', event.target.value)} /></Field><Field label="Email"><input value={form.email} onChange={event => set('email', event.target.value)} /></Field><Field label="Phone"><input value={form.phone} onChange={event => set('phone', event.target.value)} /></Field><Field label="Address" wide><input value={form.address} onChange={event => set('address', event.target.value)} /></Field></div></Modal>;
}

export function BillingPaymentEditor({ document, onClose, onSave }) {
  const due = balanceOf(document); const [amount, setAmount] = useState(due);
  return <Modal title={`Record payment · #${document.number}`} subtitle={`${document.clientName} · balance ${money(due)}`} onClose={onClose} footer={<><span /><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(Math.min(due, Number(amount || 0)))}>Record payment</Button></div></>}><Field label="Payment received (₹)"><input type="number" min="1" max={due} value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></Field></Modal>;
}

export default function Billing({ data, onEdit, openNew, openProfile, onDuplicate, onDelete, onConvert, onPayment }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [month, setMonth] = useState('all');
  const [status, setStatus] = useState('active');
  const [view, setView] = useState('list');
  const [createKind, setCreateKind] = useState('quotation');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const months = useMemo(() => [...new Set(data.documents.map(doc => monthKey(doc.date)).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [data.documents]);
  const live = data.documents.filter(doc => status === 'all' || (status === 'active' ? doc.status !== 'cancelled' : doc.status === status));
  const documents = useMemo(() => live.filter(doc => month === 'all' || monthKey(doc.date) === month).filter(doc => (kind === 'all' || doc.kind === kind) && (!query || [doc.clientName, doc.clientPhone, doc.number, typeLabel(doc.kind), ...(doc.items || []).map(item => item.name)].join(' ').toLowerCase().includes(query.toLowerCase()))).sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date))), [live, query, kind, month]);
  const invoices = live.filter(doc => isInvoice(doc.kind));
  const offers = live.filter(doc => isOffer(doc.kind));
  const billed = invoices.reduce((sum, doc) => sum + documentTotals(doc).grand, 0);
  const paid = invoices.reduce((sum, doc) => sum + Number(doc.paid || 0), 0);
  const offered = offers.reduce((sum, doc) => sum + documentTotals(doc).grand, 0);
  const gst = invoices.reduce((sum, doc) => sum + documentTotals(doc).gst, 0);
  const counts = Object.fromEntries(DOCUMENT_TYPES.map(([value]) => [value, live.filter(doc => doc.kind === value).length]));
  const maxType = Math.max(1, ...Object.values(counts));
  const monthlyTotals = Object.values(live.reduce((groups, doc) => {
    const key = monthKey(doc.date) || 'undated';
    const row = groups[key] || { key, documents: 0, offered: 0, invoiced: 0, collected: 0, pending: 0, gst: 0 };
    const totals = documentTotals(doc);
    row.documents += 1;
    if (isInvoice(doc.kind)) {
      const collectedAmount = Math.min(totals.grand, Number(doc.paid || 0));
      row.invoiced += totals.grand;
      row.collected += collectedAmount;
      row.pending += Math.max(0, totals.grand - collectedAmount);
      row.gst += totals.gst;
    } else if (isOffer(doc.kind)) row.offered += totals.grand;
    groups[key] = row;
    return groups;
  }, {})).sort((a, b) => b.key.localeCompare(a.key));
  return <section className="page active billing-hub" id="billing">
    <div className="softwarebar"><div className="v68-page-heading"><span>Sales & documents</span><h1>Bills</h1></div><div className="actions"><button className="btn" type="button" onClick={openProfile}>Company details</button><select className="filter bill-create-select" value={createKind} onChange={event => setCreateKind(event.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className="btn dark" type="button" onClick={() => openNew(createKind)}>＋ Create New</button></div></div>
    <nav className="bill-category-tabs"><button className={kind === 'all' ? 'active' : ''} type="button" onClick={() => setKind('all')}>All <b>{live.length}</b></button>{DOCUMENT_TYPES.map(([value, label]) => <button className={kind === value ? 'active' : ''} type="button" key={value} onClick={() => setKind(value)}>{label} <b>{counts[value]}</b></button>)}</nav>
    <div className="bill-filter-panel"><div className="bill-filter-title"><strong>⌄ Filters</strong><button type="button" onClick={() => { setQuery(''); setKind('all'); setMonth('all'); setStatus('active'); }}>↶ Reset</button></div><div className="bill-filter-row"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search client, document number or item" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Status: Active</option><option value="all">Status: All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select><select value={month} onChange={event => setMonth(event.target.value)}><option value="all">Date Range: All</option>{months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select><div className="bill-view-toggle"><button className={view === 'list' ? 'active' : ''} type="button" onClick={() => setView('list')} title="List view">☷</button><button className={view === 'cards' ? 'active' : ''} type="button" onClick={() => setView('cards')} title="Card view">▦</button></div></div></div>
    <button className="bill-collapse" type="button" onClick={() => setSummaryOpen(value => !value)}><span>{summaryOpen ? '⌄' : '›'} Document Summary</span><b>{documents.length} documents</b></button>{summaryOpen && <div className="bill-summary-grid"><div><span>Quotation / estimate value</span><strong>{money(offered)}</strong></div><div><span>Total invoiced</span><strong>{money(billed)}</strong></div><div><span>Collected</span><strong>{money(paid)}</strong></div><div><span>Pending</span><strong>{money(Math.max(0, billed - paid))}</strong></div><div><span>GST</span><strong>{money(gst)}</strong></div></div>}
    <button className="bill-collapse" type="button" onClick={() => setGraphOpen(value => !value)}><span>{graphOpen ? '⌄' : '›'} Document Graph</span><b>By category</b></button>{graphOpen && <div className="bill-type-graph">{DOCUMENT_TYPES.map(([value, label]) => <div key={value}><span>{label}</span><i style={{ width: `${counts[value] / maxType * 100}%` }} /><b>{counts[value]}</b></div>)}</div>}
    <div className="bill-results-head"><span>Showing <b>{documents.length}</b> documents</span><button type="button" onClick={() => window.print()}>⇩ Download / Print List</button></div>
    {view === 'list' ? <div className="bill-table-wrap"><table className="bill-table"><thead><tr><th>Date</th><th>Document</th><th>Billed To</th><th>Line Items</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{documents.map(doc => { const totals = documentTotals(doc); const due = balanceOf(doc); const paymentStatus = due <= 0 ? 'paid' : Number(doc.paid || 0) > 0 ? 'part_paid' : 'unpaid'; const status = isInvoice(doc.kind) ? paymentStatus : (doc.status || 'draft'); const statusLabel = { paid: 'Paid', part_paid: 'Part-paid', unpaid: 'Unpaid' }[status] || status; return <tr key={doc.id}><td>{shortDate(doc.date)}</td><td><strong>{typeLabel(doc.kind)}</strong><span>#{doc.number}</span></td><td><strong>{doc.clientName || 'Client'}</strong><span>{doc.clientPhone || doc.clientCity || '-'}</span></td><td><span>{(doc.items || []).map(item => item.name).filter(Boolean).join(' · ') || 'No items'}</span></td><td><strong>{money(totals.grand)}</strong></td><td><em className={`bill-status ${status}`}>{statusLabel}</em></td><td><div className="bill-row-actions"><button className="bill-action-view" type="button" aria-label="View PDF" title="View PDF" onClick={() => printBillingDocument(doc, data.billingProfile)}><BillIcon name="view" /></button><button className="bill-action-edit" type="button" aria-label="Edit document" title="Edit document" onClick={() => onEdit(doc)}><BillIcon name="edit" /></button><button className="bill-action-copy" type="button" aria-label="Duplicate document" title="Duplicate document" onClick={() => onDuplicate(doc)}><BillIcon name="duplicate" /></button><button className="bill-action-delete" type="button" aria-label="Delete document" title="Delete document" onClick={() => onDelete(doc)}><BillIcon name="delete" /></button>{isOffer(doc.kind) ? <button className="bill-action-convert" type="button" aria-label="Convert to invoice" title="Convert this document to invoice" onClick={() => onConvert(doc)}><BillIcon name="convert" /><span>Invoice</span></button> : <button className="bill-action-pay" type="button" disabled={due <= 0} aria-label={due > 0 ? 'Record payment' : 'Payment completed'} title={due > 0 ? 'Record payment' : 'Payment completed'} onClick={() => onPayment(doc)}><BillIcon name="payment" /></button>}</div></td></tr>; })}</tbody></table>{!documents.length && <Empty>No billing documents match this view.</Empty>}</div> : <div className="bill-card-grid">{documents.map(doc => { const due = balanceOf(doc); return <article className="bill-card-new" key={doc.id}><div><em>{typeLabel(doc.kind)}</em><span>#{doc.number}</span></div><h3>{doc.clientName || 'Client'}</h3><p>{shortDate(doc.date)} · {(doc.items || []).map(item => item.name).filter(Boolean).join(' · ') || 'No items'}</p><strong>{money(documentTotals(doc).grand)}</strong><div className="bill-row-actions bill-card-actions"><button className="bill-action-view" type="button" onClick={() => printBillingDocument(doc, data.billingProfile)}><BillIcon name="view" /> View</button><button className="bill-action-edit" type="button" onClick={() => onEdit(doc)}><BillIcon name="edit" /> Edit</button><button className="bill-action-copy" type="button" onClick={() => onDuplicate(doc)}><BillIcon name="duplicate" /> Copy</button><button className="bill-action-delete" type="button" onClick={() => onDelete(doc)}><BillIcon name="delete" /> Delete</button>{isOffer(doc.kind) ? <button className="bill-action-convert" type="button" onClick={() => onConvert(doc)}><BillIcon name="convert" /> Invoice</button> : <button className="bill-action-pay" type="button" disabled={due <= 0} onClick={() => onPayment(doc)}><BillIcon name="payment" /> {due > 0 ? 'Payment' : 'Paid'}</button>}</div></article>})}{!documents.length && <Empty>No billing documents match this view.</Empty>}</div>}
    <section className="bill-monthly-insights"><header><div><span>In-depth overview</span><h2>Monthly totals</h2></div><p>All active billing documents, grouped month-wise.</p></header><div className="bill-monthly-table-wrap"><table className="bill-monthly-table"><thead><tr><th>Month</th><th>Documents</th><th>Quotation / Estimate</th><th>Invoiced</th><th>Collected</th><th>Pending</th><th>GST</th></tr></thead><tbody>{monthlyTotals.map(row => <tr key={row.key}><td><strong>{row.key === 'undated' ? 'Undated' : monthLabel(row.key)}</strong></td><td>{row.documents}</td><td>{money(row.offered)}</td><td>{money(row.invoiced)}</td><td className="positive">{money(row.collected)}</td><td className="negative">{money(row.pending)}</td><td>{money(row.gst)}</td></tr>)}</tbody></table>{!monthlyTotals.length && <Empty>No monthly billing data yet.</Empty>}</div></section>
  </section>;
}
