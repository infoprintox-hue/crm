'use client';

import { useMemo, useState } from 'react';
import { initials, shortDate, today, uid } from '@/lib/client/business';
import { Avatar, Button, Empty, Field, Modal } from '../ui';

const BLANK_TASK = { name: '', client: '', type: 'Graphic Design', assignees: [], due: today(), time: '18:00', priority: 'Medium', status: 'In Progress', notes: '', checklist: [] };

export function TaskEditor({ task, data, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ ...BLANK_TASK, ...(task || {}), assignees: task?.assignees?.length ? task.assignees : task?.assignee ? [task.assignee] : [], checklist: task?.checklist || [] });
  const [step, setStep] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function toggleMember(id) { set('assignees', form.assignees.includes(id) ? form.assignees.filter(item => item !== id) : [...form.assignees, id]); }
  function addStep() { if (!step.trim() || form.checklist.length >= 12) return; set('checklist', [...form.checklist, { id: uid('step'), text: step.trim(), done: false }]); setStep(''); }
  function submit(event) { event.preventDefault(); if (!form.name.trim()) return; onSave({ ...form, id: form.id || uid('task'), name: form.name.trim(), assignee: form.assignees[0] || '', createdAt: form.createdAt || new Date().toISOString(), completedAt: form.status === 'Completed' ? (form.completedAt || new Date().toISOString()) : '' }); }
  return (
    <Modal title={task ? 'Edit task' : 'Create task'} subtitle="Assign the work, deadline and deliverables" onClose={onClose} wide footer={<><div>{task && <Button variant="danger" onClick={() => onDelete(task)}>Delete</Button>}</div><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save task</Button></div></>}>
      <form className="form form-grid" onSubmit={submit}>
        <Field label="Task title" wide><input value={form.name} onChange={event => set('name', event.target.value)} autoFocus /></Field>
        <Field label="Client / project"><input value={form.client} onChange={event => set('client', event.target.value)} list="task-clients" /><datalist id="task-clients">{data.leads.map(lead => <option key={lead.id} value={lead.company || lead.name || lead.phone} />)}</datalist></Field><Field label="Work type"><select value={form.type} onChange={event => set('type', event.target.value)}><option>Graphic Design</option><option>Website Design</option><option>Digital Marketing</option><option>Operations</option></select></Field>
        <Field label="Assign team members" wide><div className="member-picker">{data.team.map(member => <button type="button" key={member.id} className={form.assignees.includes(member.id) ? 'active' : ''} onClick={() => toggleMember(member.id)}><Avatar name={member.name} src={member.avatar} size="tiny" />{member.name}</button>)}</div></Field>
        <Field label="Due date"><input type="date" value={form.due} onChange={event => set('due', event.target.value)} /></Field><Field label="Due time"><input type="time" value={form.time} onChange={event => set('time', event.target.value)} /></Field>
        <Field label="Priority"><select value={form.priority} onChange={event => set('priority', event.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></Field><Field label="Status"><select value={form.status} onChange={event => set('status', event.target.value)}><option>In Progress</option><option>Completed</option></select></Field>
        <Field label="Instructions" wide><textarea rows="4" value={form.notes} onChange={event => set('notes', event.target.value)} /></Field>
        <Field label="Checklist / deliverables" wide hint="Up to 12 clear steps"><div className="step-add"><input value={step} onChange={event => setStep(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addStep(); } }} placeholder="Add a deliverable" /><Button type="button" onClick={addStep}>＋ Add</Button></div><div className="step-editor">{form.checklist.map((item, index) => <div key={item.id}><span>{index + 1}</span><input value={item.text} onChange={event => set('checklist', form.checklist.map(entry => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} /><button type="button" onClick={() => set('checklist', form.checklist.filter(entry => entry.id !== item.id))}>×</button></div>)}</div></Field>
      </form>
    </Modal>
  );
}

export function TaskProgressEditor({ task, onClose, onSave }) {
  const [status, setStatus] = useState(task.status === 'Completed' ? 'Completed' : 'In Progress');
  const [workUpdate, setWorkUpdate] = useState(task.workUpdate || '');
  const [workLink, setWorkLink] = useState(task.workLink || '');
  return <Modal title={task.name} subtitle={task.client || task.type} onClose={onClose} footer={<><span /><div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ taskId: task.id, status, workUpdate, workLink })}>Save update</Button></div></>}><div className="form form-grid"><Field label="Status" wide><select value={status} onChange={event => setStatus(event.target.value)}><option>In Progress</option><option>Completed</option></select></Field><Field label="Work update" wide><textarea rows="5" value={workUpdate} onChange={event => setWorkUpdate(event.target.value)} placeholder="What is completed and what is pending?" /></Field><Field label="Work link" wide><input value={workLink} onChange={event => setWorkLink(event.target.value)} placeholder="Drive, Figma or live link" /></Field></div></Modal>;
}

function TaskCard({ task, team, canManage, onEdit, onProgress, onChecklist }) {
  const assignees = (task.assignees?.length ? task.assignees : [task.assignee]).filter(Boolean).map(id => team.find(member => member.id === id)).filter(Boolean);
  const checklist = task.checklist || [];
  const done = checklist.filter(item => item.done).length;
  const progress = checklist.length ? Math.round(done / checklist.length * 100) : task.status === 'Completed' ? 100 : 0;
  const late = task.status !== 'Completed' && task.due && task.due < today();
  const dueDate = task.due ? new Date(`${task.due}T00:00:00`) : null;
  const day = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString('en-IN', { day: '2-digit' }) : '—';
  const month = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString('en-IN', { month: 'short' }) : 'No date';
  const daysLeft = task.due ? Math.ceil((new Date(`${task.due}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000) : null;
  const timer = task.status === 'Completed' ? 'Completed' : daysLeft == null ? 'No deadline' : daysLeft < 0 ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue` : daysLeft === 0 ? `Due today · ${task.time || 'No time'}` : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${task.time || 'No time'}`;
  return (
    <article className={`vlos-task-card ${late ? 'overdue' : ''} ${task.status === 'Completed' ? 'completed' : ''}`}>
      <div className="vlos-task-meta"><span className={`vlos-status ${task.status === 'Completed' ? 'done' : late ? 'late' : 'progress'}`}>{task.status === 'Completed' ? 'Completed' : late ? 'Overdue' : 'In progress'}</span><div className="vlos-date"><strong>{day}</strong><span>{month}</span></div></div>
      <div className="vlos-task-heading"><h3>{task.name}</h3><button className="vlos-menu-btn" type="button" onClick={() => canManage ? onEdit(task) : onProgress(task)}>•••</button></div>
      <div className="vlos-detail"><div className="vlos-detail-text">{task.notes || 'No task details added.'}</div><button className="vlos-readmore" type="button" onClick={() => onProgress(task)}>Work Update</button></div>
      <div className="vlos-task-chips"><span className={`vlos-chip ${String(task.priority || 'Medium').toLowerCase()}`}>{task.priority || 'Medium'}</span><span className="vlos-chip">{task.status === 'Completed' ? 'Done' : 'In Progress'}</span><span className="vlos-chip client">{task.client || 'Internal work'}</span></div>
      <div className="vlos-task-footer"><span className="vlos-assignee">{assignees.map(member => member.name).join(', ') || 'Unassigned'} · {task.time || 'No time'}</span><span className="vlos-chip">{task.type || 'Task'}</span></div>
      {checklist.length > 0 && <div className="vlos-task-chips">{checklist.slice(0, 3).map(item => <button className={`vlos-chip ${item.done ? 'done' : ''}`} type="button" key={item.id} onClick={() => onChecklist(task, item, !item.done)}>{item.done ? '✓' : '○'} {item.text}</button>)}</div>}
      <div className="vlos-timer-wrap"><button className={`vlos-timer ${task.status === 'Completed' ? 'done' : late ? 'late' : daysLeft === 0 ? 'urgent' : daysLeft == null ? 'none' : 'normal'}`} type="button" onClick={() => onProgress(task)}>{timer}</button></div>
    </article>
  );
}

export default function Tasks({ data, user, onEdit, onProgress, onChecklist, openNew }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [member, setMember] = useState('all');
  const canManage = ['admin', 'subadmin', 'sales', 'teamlead'].includes(user.role);
  const tasks = useMemo(() => data.tasks.filter(task => {
    const hay = [task.name, task.client, task.type].join(' ').toLowerCase();
    const memberMatch = member === 'all' || task.assignee === member || task.assignees?.includes(member);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const filterMatch = filter === 'done' ? task.status === 'Completed' : filter === 'today' ? task.due === today() : filter === 'tomorrow' ? task.due === tomorrow : filter === 'progress' ? task.status === 'In Progress' : task.status !== 'Completed';
    return (!query || hay.includes(query.toLowerCase())) && memberMatch && filterMatch;
  }).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))), [data.tasks, query, filter, member]);
  return (
    <section className="page active" id="tasks">
      <div className="vlos-pagebar"><div><div className="vlos-eyebrow">Work Management</div><h1 className="vlos-page-title">Team Tasks</h1></div><div className="actions">{canManage && <button className="btn dark vlos-admin-sales-only" type="button" onClick={openNew}>＋ Add Task</button>}</div></div>
      <div className="vlos-member-strip"><button className={`vlos-member-pill ${member === 'all' ? 'active' : ''}`} onClick={() => setMember('all')}>All Team</button>{data.team.map(person => <button key={person.id} className={`vlos-member-pill ${member === person.id ? 'active' : ''}`} onClick={() => setMember(person.id)}>{person.name}</button>)}</div>
      <div className="vlos-task-toolbar"><div className="search vlos-task-search"><input placeholder="Search task, client or team member" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="vlos-task-filters">{[['all', 'Pending'], ['today', 'Due today'], ['tomorrow', 'Tomorrow'], ['progress', 'In progress'], ['done', 'Completed']].map(([value, label]) => <button type="button" key={value} className={`vlos-filter ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className="vlos-task-grid">{tasks.length ? tasks.map(task => <TaskCard key={task.id} task={task} team={data.team} canManage={canManage} onEdit={onEdit} onProgress={onProgress} onChecklist={onChecklist} />) : <Empty>No tasks match this view.</Empty>}</div>
    </section>
  );
}
