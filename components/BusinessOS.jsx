'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { ACCESS, documentTotals, EMPTY_STATE, normaliseStage, today, uid } from '@/lib/client/business';
import Login from './Login';
import Shell from './Shell';
import AdminSecurity from './AdminSecurity';
import Dashboard from './views/Dashboard';
import Sales, { CallEditor, ImportedLeadManager, leadWhatsAppHref, LeadEditor, SalesLeadViewer } from './views/Sales';
import Tasks, { TaskEditor, TaskProgressEditor } from './views/Tasks';
import { Clients, Collection, Finance, FinanceEditor } from './views/Operations';
import Billing, { BillingEditor, BillingPaymentEditor, BillingProfileEditor, INVOICE_KINDS, OFFER_KINDS, printBillingDocument } from './views/Billing';
import Team, { TeamEditor } from './views/Team';

export default function BusinessOS() {
  const [status, setStatus] = useState('booting');
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [data, setData] = useState(EMPTY_STATE);
  const [page, setPage] = useState('overview');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState('light');

  const notify = useCallback(message => setToast(message), []);

  async function loadMembers() {
    try {
      const result = await api('/api/auth?members=1');
      setMembers(result.members || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function loadState(nextUser = user) {
    const result = await api('/api/state');
    setData({ ...EMPTY_STATE, ...(result.data || {}) });
    const activeUser = result.user || nextUser;
    setUser(activeUser);
    const allowed = ACCESS[activeUser?.role] || ACCESS.team;
    setPage(current => allowed.includes(current) ? current : allowed[0]);
    setStatus('ready');
  }

  useEffect(() => {
    setTheme(localStorage.getItem('visitinglink-theme') || 'light');
    (async () => {
      try {
        const session = await api('/api/auth?me=1');
        setUser(session.user);
        await loadState(session.user);
      } catch {
        await loadMembers();
        setStatus('login');
      }
    })();
  }, []);

  useEffect(() => {
    if (status === 'booting') return;
    localStorage.setItem('visitinglink-theme', theme);
  }, [theme, status]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (status !== 'ready') return;
    api('/api/activity', { method: 'POST', body: JSON.stringify({ action: 'page_view', page }) }).catch(() => undefined);
  }, [page, status]);

  async function login(payload) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/auth', { method: 'POST', body: JSON.stringify(payload) });
      setUser(result.user);
      await loadState(result.user);
      api('/api/activity', { method: 'POST', body: JSON.stringify({ action: 'app_open', page: (ACCESS[result.user.role] || ACCESS.team)[0] }) }).catch(() => undefined);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => undefined);
    setUser(null);
    setData(EMPTY_STATE);
    setModal(null);
    setError('');
    await loadMembers();
    setStatus('login');
  }

  async function changeAdminPassword(currentPassword, newPassword) {
    setSaving(true);
    try {
      const result = await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'changePassword', currentPassword, newPassword }) });
      if (result.user) setUser(result.user);
      notify('Password changed · all other devices logged out');
      return true;
    } catch (passwordError) {
      notify(passwordError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function logoutOtherDevices() {
    if (!window.confirm('Logout every other device currently signed in to this software?')) return false;
    setSaving(true);
    try {
      const result = await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'massLogout' }) });
      if (result.user) setUser(result.user);
      notify('All other devices have been logged out');
      return true;
    } catch (logoutError) {
      notify(logoutError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function persist(next, message) {
    const previous = data;
    setData(next);
    setSaving(true);
    try {
      const type = user.role === 'sales' ? 'replaceSalesState' : user.role === 'teamlead' ? 'replaceTaskState' : 'replaceState';
      const result = await api('/api/state', { method: 'POST', body: JSON.stringify({ operation: { type, data: next }, editor: user.name }) });
      setData({ ...EMPTY_STATE, ...(result.data || next) });
      if (message) notify(message);
      return true;
    } catch (saveError) {
      setData(previous);
      notify(saveError.message);
      if (saveError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function restoreBackup(restored) {
    if (!restored || typeof restored !== 'object' || Array.isArray(restored)) {
      notify('This backup file is not valid');
      return false;
    }
    if (!window.confirm('Restore this backup? Current company data will be replaced.')) return false;
    return persist({ ...structuredClone(EMPTY_STATE), ...restored }, 'Backup restored');
  }

  async function runOperation(operation, message) {
    setSaving(true);
    try {
      const result = await api('/api/state', { method: 'POST', body: JSON.stringify({ operation }) });
      setData({ ...EMPTY_STATE, ...(result.data || data) });
      if (message) notify(message);
      return true;
    } catch (operationError) {
      notify(operationError.message);
      if (operationError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveLead(lead, options = {}) {
    const previous = data;
    const next = structuredClone(data);
    const index = next.leads.findIndex(item => item.id === lead.id);
    if (index >= 0) next.leads[index] = lead;
    else next.leads.unshift(lead);
    let autoTask = null;
    if (normaliseStage(lead.stage) === 'Converted / Payment Done' && !next.tasks.some(task => task.leadId === lead.id)) {
      autoTask = { id: uid('task'), leadId: lead.id, name: `${lead.service || 'Client work'} · ${lead.company || lead.name || lead.phone}`, client: lead.company || lead.name || lead.phone, type: String(lead.service || '').toLowerCase().includes('website') ? 'Website Design' : String(lead.service || '').toLowerCase().includes('digital') ? 'Digital Marketing' : 'Graphic Design', assignee: '', assignees: [], due: lead.delivery || lead.follow || today(), time: '18:00', priority: 'High', status: 'In Progress', notes: lead.notes || '', checklist: [], createdFrom: 'Sales CRM', createdAt: new Date().toISOString() };
      next.tasks.unshift(autoTask);
    }
    setData(next);
    if (!options.keepOpen) setModal(null);
    setSaving(true);
    try {
      const result = await api('/api/state', { method: 'POST', body: JSON.stringify({ operation: { type: 'upsertLead', lead, autoTask } }) });
      setData({ ...EMPTY_STATE, ...(result.data || next) });
      notify(index >= 0 ? 'Lead updated' : 'Lead added');
      return true;
    } catch (saveError) {
      setData(previous);
      if (!options.keepOpen) setModal({ type: 'lead', item: lead });
      notify(saveError.message);
      if (saveError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }

  function deleteLead(lead) {
    if (!window.confirm(`Delete ${lead.name || lead.phone}?`)) return;
    const next = structuredClone(data);
    next.leads = next.leads.filter(item => item.id !== lead.id);
    setModal(null);
    persist(next, 'Lead deleted');
  }

  async function moveLead(lead, stage) {
    await runOperation({ type: 'moveLeadStage', leadId: lead.id, stage }, 'Stage updated');
  }

  async function markLead(lead) {
    await runOperation({ type: 'markLeadCalled', leadId: lead.id, eventId: uid('call'), date: today(), at: new Date().toISOString() }, 'Lead marked called');
  }

  async function assignLeadToSales(lead, memberId) {
    const member = data.team.find(item => item.id === memberId);
    const previous = data;
    const leadId = String(lead.id);
    const next = { ...data, team: data.team.map(item => {
      const assigned = new Set((item.assignedLeadIds || []).map(String));
      assigned.delete(leadId);
      if (memberId && String(item.id) === String(memberId)) assigned.add(leadId);
      return { ...item, assignedLeadIds: [...assigned] };
    }) };
    setData(next);
    setSaving(true);
    try {
      await api('/api/state', { method: 'POST', body: JSON.stringify({ operation: { type: 'assignLeadToSales', leadId, memberId } }) });
      notify(member ? `Lead assigned to ${member.name}` : 'Lead unassigned');
      return true;
    } catch (assignError) {
      setData(previous);
      notify(assignError.message);
      if (assignError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function assignLeadsToSales(leadIds, memberId) {
    const member = data.team.find(item => item.id === memberId);
    const ids = [...new Set(leadIds.map(String))];
    const idSet = new Set(ids);
    const previous = data;
    const next = { ...data, team: data.team.map(item => {
      const assigned = new Set((item.assignedLeadIds || []).map(String));
      idSet.forEach(id => assigned.delete(id));
      if (memberId && String(item.id) === String(memberId)) idSet.forEach(id => assigned.add(id));
      return { ...item, assignedLeadIds: [...assigned] };
    }) };
    setData(next);
    setSaving(true);
    try {
      await api('/api/state', { method: 'POST', body: JSON.stringify({ operation: { type: 'assignLeadsToSales', leadIds: ids, memberId } }) });
      notify(member ? `${ids.length} leads shared with ${member.name}` : `${ids.length} lead assignments removed`);
      return true;
    } catch (assignError) {
      setData(previous);
      notify(assignError.message);
      if (assignError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function salesPhoneAction(lead, action = 'reveal') {
    let popup = null;
    if (action === 'whatsapp') popup = window.open('about:blank', '_blank');
    setSaving(true);
    try {
      const result = await api('/api/sales-access', { method: 'POST', body: JSON.stringify({ action, leadId: lead.id }) });
      const revealed = { ...lead, phone: result.phone, _phoneRevealed: true };
      setData(current => ({ ...current, leads: current.leads.map(item => item.id === lead.id ? revealed : item) }));
      if (action === 'copy') {
        try { await navigator.clipboard.writeText(result.phone); notify('Number copied · access logged'); } catch { notify(`Number: ${result.phone}`); }
      } else if (action === 'whatsapp') {
        const href = leadWhatsAppHref(revealed);
        if (popup && href) { popup.opener = null; popup.location.replace(href); }
        else { popup?.close(); notify('WhatsApp number is not valid'); }
      } else if (action === 'call') {
        setModal({ type: 'call', item: revealed });
      } else {
        notify(`Number shown · ${result.remaining} new number${result.remaining === 1 ? '' : 's'} left today`);
      }
      return revealed;
    } catch (accessError) {
      popup?.close();
      notify(accessError.message);
      if (accessError.status === 401) logout();
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function importLeads(incoming, fileName) {
    const next = structuredClone(data);
    const phones = new Set(next.leads.map(lead => String(lead.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
    const added = incoming.filter(lead => { const phone = String(lead.phone || '').replace(/\D/g, '').slice(-10); if (phone && phones.has(phone)) return false; if (phone) phones.add(phone); return true; });
    next.leads = [...added, ...next.leads];
    next.importHistory = [{ id: uid('import'), fileName, importedAt: new Date().toISOString(), total: incoming.length, added: added.length, skipped: incoming.length - added.length }, ...next.importHistory].slice(0, 80);
    await persist(next, `${added.length} leads imported`);
  }

  async function deleteImportedLeads(leadIds) {
    if (!leadIds.length || !window.confirm(`Delete ${leadIds.length} selected imported lead${leadIds.length === 1 ? '' : 's'}? You can undo this deletion.`)) return false;
    const ok = await runOperation({ type: 'deleteImportedLeads', leadIds, batchId: uid('lead_trash') }, `${leadIds.length} imported leads deleted`);
    if (ok) setModal(null);
    return ok;
  }

  async function undoImportedLeads() {
    const batch = data.leadTrash?.[0];
    if (!batch) return notify('There is no recent lead deletion to restore');
    const ok = await runOperation({ type: 'undoDeleteImportedLeads', batchId: batch.batchId }, `${batch.leads?.length || 0} leads restored`);
    if (ok && modal?.type === 'imports') setModal(null);
    return ok;
  }

  async function deleteDuplicateLeads() {
    const seen = new Set();
    const duplicateIds = [];
    [...data.leads].sort((a, b) => Date.parse(b.lastUpdatedAt || b.createdAt || 0) - Date.parse(a.lastUpdatedAt || a.createdAt || 0)).forEach(lead => {
      const phone = String(lead.phone || '').replace(/\D/g, '').slice(-10);
      if (!phone) return;
      if (seen.has(phone)) duplicateIds.push(lead.id);
      else seen.add(phone);
    });
    if (!duplicateIds.length) return notify('No duplicate phone numbers found');
    if (!window.confirm(`Delete ${duplicateIds.length} duplicate lead${duplicateIds.length === 1 ? '' : 's'}? The latest copy of each phone number will stay.`)) return false;
    const next = structuredClone(data);
    next.leads = next.leads.filter(lead => !duplicateIds.includes(lead.id));
    return persist(next, `${duplicateIds.length} duplicate leads deleted`);
  }

  function saveTask(task) {
    const next = structuredClone(data);
    const index = next.tasks.findIndex(item => item.id === task.id);
    if (index >= 0) next.tasks[index] = task;
    else next.tasks.unshift(task);
    setModal(null);
    persist(next, index >= 0 ? 'Task updated' : 'Task created');
  }

  function deleteTask(task) {
    if (!window.confirm(`Delete ${task.name}?`)) return;
    const next = structuredClone(data);
    next.tasks = next.tasks.filter(item => item.id !== task.id);
    setModal(null);
    persist(next, 'Task deleted');
  }

  async function checklist(task, item, done) {
    await runOperation({ type: 'updateTaskChecklistItem', taskId: task.id, itemId: item.id, done }, done ? 'Step completed' : 'Step reopened');
  }

  async function taskProgress(update) {
    const ok = await runOperation({ type: 'updateTaskProgress', ...update }, 'Work update saved');
    if (ok) setModal(null);
  }

  function saveFinance(entry) { const next = structuredClone(data); next.finance.unshift(entry); setModal(null); persist(next, 'Money entry saved'); }
  function deleteFinance(entry) { if (!window.confirm('Delete this money entry?')) return; const next = structuredClone(data); next.finance = next.finance.filter(item => item.id !== entry.id); persist(next, 'Entry deleted'); }
  async function saveDocument(document, options = {}) {
    const previous = data;
    const next = structuredClone(data);
    const index = next.documents.findIndex(item => item.id === document.id);
    if (index >= 0) next.documents[index] = document;
    else next.documents.unshift(document);
    const lead = next.leads.find(item => item.id === document.leadId);
    if (lead) {
      const total = Number(documentTotals(document).grand || 0);
      if (OFFER_KINDS.includes(document.kind)) {
        lead.quote = total;
        if (['New Lead', 'Contacted'].includes(normaliseStage(lead.stage))) lead.stage = 'Proposal Sent';
      } else {
        lead.deal = Math.max(Number(lead.deal || 0), total);
        lead.paid = Math.max(Number(lead.paid || 0), Number(document.paid || 0));
        if (document.dueDate) lead.collectionDate = document.dueDate;
        if (!lead.collectionNote) lead.collectionNote = `Invoice #${document.number}`;
      }
    }
    setData(next);
    if (!options.keepOpen) setModal(null);
    setSaving(true);
    try {
      const result = await api('/api/state', { method: 'POST', body: JSON.stringify({ operation: { type: 'upsertBillingDocument', document } }) });
      setData({ ...EMPTY_STATE, ...(result.data || next) });
      notify(index >= 0 ? 'Document updated' : 'Document created');
      return true;
    } catch (saveError) {
      setData(previous);
      if (!options.keepOpen) setModal({ type: 'billing', item: document, kind: document.kind, leadId: document.leadId || '' });
      notify(saveError.message);
      if (saveError.status === 401) logout();
      return false;
    } finally {
      setSaving(false);
    }
  }
  function deleteDocument(document) { if (!window.confirm(`Delete ${document.kind} #${document.number}?`)) return; const next = structuredClone(data); next.documents = next.documents.filter(item => item.id !== document.id); setModal(null); persist(next, 'Document deleted'); }
  async function duplicateDocument(document) {
    const kind = document.kind;
    const numbers = data.documents.filter(item => item.kind === kind).map(item => Number(String(item.number || '').replace(/\D/g, ''))).filter(Boolean);
    const prefix = { quotation: 'Q', estimate: 'E', proforma: 'PI', sales_invoice: 'SI', invoice: 'INV' }[kind] || 'DOC';
    const copy = { ...structuredClone(document), id: uid('bill'), number: `${prefix}${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0')}`, date: today(), paid: 0, status: 'draft', createdAt: new Date().toISOString() };
    delete copy.quotationId;
    const next = structuredClone(data);
    next.documents.unshift(copy);
    const ok = await persist(next, 'Document duplicated');
    if (ok) setModal({ type: 'billing', item: copy });
  }
  async function convertQuotation(document) {
    const numbers = data.documents.filter(item => item.kind === 'invoice').map(item => Number(String(item.number || '').replace(/\D/g, ''))).filter(Boolean);
    const invoice = { ...structuredClone(document), kind: 'invoice', title: 'Invoice', number: `INV${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0')}`, date: today(), paid: Number(document.paid || 0), status: 'sent', convertedFrom: document.kind, convertedAt: new Date().toISOString() };
    const ok = await saveDocument(invoice);
    if (ok) { notify('Document converted to invoice'); printBillingDocument(invoice, data.billingProfile); }
  }
  async function recordBillingPayment(document, amount) {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return notify('Enter a valid payment amount');
    const next = structuredClone(data);
    const doc = next.documents.find(item => item.id === document.id);
    if (!doc) return false;
    doc.paid = Number(doc.paid || 0) + Number(amount);
    if (doc.paid >= documentTotals(doc).grand) doc.status = 'paid';
    const lead = next.leads.find(item => item.id === doc.leadId);
    if (lead) { lead.paid = Math.max(Number(lead.paid || 0), Number(doc.paid || 0)); lead.lastCollectionAt = new Date().toISOString(); }
    const ok = await persist(next, 'Bill payment recorded');
    if (ok) setModal(null);
    return ok;
  }
  async function saveBillingProfile(profile, options = {}) {
    const next = structuredClone(data);
    next.billingProfile = profile;
    const ok = await persist(next, 'Billing profile saved');
    if (ok && !options.keepOpen) setModal(null);
    return ok;
  }
  function saveMember(member) { const next = structuredClone(data); const index = next.team.findIndex(item => item.id === member.id); if (index >= 0) next.team[index] = { ...next.team[index], ...member }; else next.team.push(member); setModal(null); persist(next, index >= 0 ? 'Team member updated' : 'Team member added'); }
  function deleteMember(member) { if (!window.confirm(`Delete ${member.name}? Assigned tasks will become unassigned.`)) return; const next = structuredClone(data); next.team = next.team.filter(item => item.id !== member.id); next.tasks = next.tasks.map(task => ({ ...task, assignee: task.assignee === member.id ? '' : task.assignee, assignees: (task.assignees || []).filter(id => id !== member.id) })); setModal(null); persist(next, 'Team member deleted'); }
  async function upload(file) { const form = new FormData(); form.append('file', file); const result = await api('/api/upload', { method: 'POST', body: form }); return result.url; }

  const view = useMemo(() => {
    if (!user) return null;
    const commonLead = { data, onEdit: item => setModal({ type: 'lead', item }), openNew: () => setModal({ type: 'lead', item: null }) };
    if (page === 'overview') return <Dashboard data={data} go={setPage} openLead={item => setModal({ type: 'lead', item: item || null })} />;
    if (page === 'sales') { const restricted = user.role === 'sales'; return <Sales {...commonLead} restricted={restricted} canAssign={user.role === 'admin'} onAssign={assignLeadToSales} onAssignMany={assignLeadsToSales} onEdit={item => setModal({ type: restricted ? 'sales-lead' : 'lead', item })} onCall={item => restricted ? salesPhoneAction(item, 'call') : setModal({ type: 'call', item })} onSecureAction={salesPhoneAction} onStage={moveLead} onMark={markLead} onImport={importLeads} onUndoImported={undoImportedLeads} onDeleteDuplicates={deleteDuplicateLeads} notify={notify} openImportManager={() => setModal({ type: 'imports' })} />; }
    if (page === 'tasks') return <Tasks data={data} user={user} onEdit={item => setModal({ type: 'task', item })} onProgress={item => setModal({ type: 'task-progress', item })} onChecklist={checklist} openNew={() => setModal({ type: 'task', item: null })} />;
    if (page === 'clients') return <Clients {...commonLead} openNew={() => setModal({ type: 'lead', item: { stage: 'Converted / Payment Done' } })} onNewTask={lead => setModal({ type: 'task', item: { leadId: lead.id, client: lead.company || lead.name || lead.phone, name: `${lead.service || 'Client work'} · ${lead.company || lead.name || lead.phone}`, type: String(lead.service || '').toLowerCase().includes('website') ? 'Website Design' : 'Graphic Design', due: today(), status: 'In Progress' } })} />;
    if (page === 'billing') return <Billing data={data} onEdit={item => setModal({ type: 'billing', item })} openNew={kind => setModal({ type: 'billing', item: null, kind })} openProfile={() => setModal({ type: 'billing-profile' })} onDuplicate={duplicateDocument} onDelete={deleteDocument} onConvert={convertQuotation} onPayment={item => setModal({ type: 'billing-payment', item })} />;
    if (page === 'finance') return <Finance data={data} openNew={() => setModal({ type: 'finance' })} onDelete={deleteFinance} />;
    if (page === 'collection') return <Collection data={data} onEdit={item => setModal({ type: 'lead', item })} onBill={item => setModal({ type: 'billing', item })} onPayment={item => setModal({ type: 'billing-payment', item })} />;
    if (page === 'team') return <Team data={data} onEdit={item => setModal({ type: 'team', item })} onDelete={deleteMember} openNew={() => setModal({ type: 'team', item: null })} />;
    return null;
  }, [page, data, user]);

  if (status === 'booting') return <div className="vl-splash" id="vlSplash"><div className="vl-splash-backdrop" /><div className="vl-splash-noise" /><div className="vl-splash-content"><img className="vl-splash-logo" src="/assets/visitinglink-logo-white.png" alt="Visitinglink" /><div className="vl-splash-sub">Business OS</div><div className="vl-splash-loader"><span /></div></div></div>;
  if (status === 'login' || !user) return <Login members={members} busy={busy} error={error} onLogin={login} />;

  return <Shell user={user} page={page} setPage={setPage} saving={saving} theme={theme} setTheme={setTheme} onLogout={logout} onSecurity={() => setModal({ type: 'admin-security' })} data={data} onRestore={restoreBackup}>
    {modal?.type === 'billing' ? <BillingEditor document={modal.item} data={data} initialKind={modal.kind} leadId={modal.leadId} onClose={() => setModal(null)} onSave={saveDocument} onDelete={deleteDocument} onSaveProfile={saveBillingProfile} onUpload={upload} notify={notify} /> : view}
    {modal?.type === 'lead' && user.role !== 'sales' && <LeadEditor lead={modal.item} data={data} onClose={() => setModal(null)} onSave={saveLead} onDelete={deleteLead} onCall={item => setModal({ type: 'call', item })} onBilling={item => setModal({ type: 'billing', item: null, kind: 'quotation', leadId: item.id })} notify={notify} />}
    {modal?.type === 'sales-lead' && user.role === 'sales' && <SalesLeadViewer lead={data.leads.find(item => item.id === modal.item.id) || modal.item} onClose={() => setModal(null)} onPhoneAction={salesPhoneAction} onCall={item => salesPhoneAction(item, 'call')} />}
    {modal?.type === 'call' && <CallEditor lead={modal.item} onClose={() => setModal(null)} onSave={async outcome => { const ok = await runOperation({ type: 'logCallOutcome', ...outcome }, 'Call outcome saved'); if (ok) setModal(null); }} />}
    {modal?.type === 'imports' && <ImportedLeadManager data={data} onClose={() => setModal(null)} onDelete={deleteImportedLeads} onUndo={undoImportedLeads} />}
    {modal?.type === 'task' && <TaskEditor task={modal.item} data={data} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} />}
    {modal?.type === 'task-progress' && <TaskProgressEditor task={modal.item} onClose={() => setModal(null)} onSave={taskProgress} />}
    {modal?.type === 'finance' && <FinanceEditor onClose={() => setModal(null)} onSave={saveFinance} />}
    {modal?.type === 'billing-profile' && <BillingProfileEditor profile={data.billingProfile} onClose={() => setModal(null)} onSave={saveBillingProfile} onUpload={upload} />}
    {modal?.type === 'billing-payment' && <BillingPaymentEditor document={modal.item} onClose={() => setModal(null)} onSave={amount => recordBillingPayment(modal.item, amount)} />}
    {modal?.type === 'team' && <TeamEditor member={modal.item} leads={data.leads} onClose={() => setModal(null)} onSave={saveMember} onDelete={deleteMember} onUpload={upload} />}
    {modal?.type === 'admin-security' && user.role === 'admin' && <AdminSecurity saving={saving} onClose={() => setModal(null)} onChangePassword={changeAdminPassword} onLogoutOthers={logoutOtherDevices} onLogout={logout} />}
    {toast && <div className="toast show vl-react-toast">{toast}</div>}
  </Shell>;
}
