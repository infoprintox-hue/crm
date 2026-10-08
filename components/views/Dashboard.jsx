'use client';

import { balance, documentTotals, initials, money, normaliseStage, received, shortDate, STAGES, today } from '@/lib/client/business';

const PALETTE = ['#0071e3', '#f6a623', '#0f9f91'];

function financeTotals(data) {
  const directIncome = data.finance.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = data.finance.filter(item => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const leadIncome = data.leads.reduce((sum, lead) => sum + received(lead), 0);
  const outstanding = data.leads.filter(lead => normaliseStage(lead.stage) === 'Converted / Payment Done').reduce((sum, lead) => sum + balance(lead), 0);
  return { revenue: leadIncome + directIncome, expenses, net: leadIncome + directIncome - expenses, outstanding };
}

function dateKey(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 7) : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return { key: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`, label: value.toLocaleDateString('en-IN', { month: 'short' }) };
  });
}

function chartRows(data) {
  return recentMonths().map(month => {
    const leadRevenue = data.leads.filter(lead => dateKey(lead.paymentDate || lead.delivery || lead.lastCallAt || lead.createdAt || lead.metaCreatedTime) === month.key).reduce((sum, lead) => sum + received(lead), 0);
    const income = data.finance.filter(item => item.type === 'income' && dateKey(item.date) === month.key).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const investment = data.finance.filter(item => item.type === 'expense' && dateKey(item.date) === month.key).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const leads = data.leads.filter(lead => dateKey(lead.createdAt || lead.metaCreatedTime || lead.follow) === month.key).length;
    const calls = data.leads.reduce((sum, lead) => sum + (lead.callHistory || []).filter(call => dateKey(call.at || call.date) === month.key).length, 0);
    const converted = data.leads.filter(lead => normaliseStage(lead.stage) === 'Converted / Payment Done' && dateKey(lead.convertedAt || lead.lastCallAt || lead.delivery || lead.createdAt) === month.key).length;
    return { ...month, revenue: leadRevenue + income, investment, net: leadRevenue + income - investment, leads, calls, converted };
  });
}

function LineChart({ rows }) {
  const width = 760;
  const height = 285;
  const left = 42;
  const top = 20;
  const innerWidth = 702;
  const innerHeight = 231;
  const values = rows.flatMap(row => [row.revenue, row.investment, row.net]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const x = index => left + (rows.length === 1 ? innerWidth / 2 : index * innerWidth / (rows.length - 1));
  const y = value => top + (max - Number(value || 0)) / range * innerHeight;
  const series = [['revenue', PALETTE[0]], ['investment', PALETTE[1]], ['net', PALETTE[2]]];
  return <svg viewBox="0 0 760 285" preserveAspectRatio="none">
    <g className="dashgrid">{Array.from({ length: 5 }, (_, index) => { const yy = top + index * innerHeight / 4; return <line key={index} x1={left} y1={yy} x2={width - 16} y2={yy} />; })}</g>
    {rows.map((row, index) => <text key={row.key} className="dashaxis" x={x(index)} y={height - 10} textAnchor="middle">{row.label}</text>)}
    {series.map(([key, color]) => <g key={key}><polyline points={rows.map((row, index) => `${x(index)},${y(row[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />{rows.map((row, index) => <circle key={row.key} cx={x(index)} cy={y(row[key])} r="4" fill={color}><title>{money(row[key])}</title></circle>)}</g>)}
  </svg>;
}

function BarChart({ rows }) {
  const max = Math.max(1, ...rows.flatMap(row => [row.leads, row.calls, row.converted]));
  const group = 474 / Math.max(1, rows.length);
  const bar = Math.min(15, group / 5);
  const y = value => 20 + 231 - (Number(value || 0) / max) * 231;
  return <svg viewBox="0 0 520 285" preserveAspectRatio="none">
    <g className="dashgrid">{Array.from({ length: 5 }, (_, index) => { const yy = 20 + index * 231 / 4; return <line key={index} x1="34" y1={yy} x2="508" y2={yy} />; })}</g>
    {rows.map((row, index) => { const center = 34 + group * index + group / 2; return <g key={row.key}>{[['leads', '#6d5dfc', -bar - 2], ['calls', '#e85378', 0], ['converted', '#0f9f91', bar + 2]].map(([key, color, offset]) => { const yy = y(row[key]); return <rect key={key} x={center + offset - bar / 2} y={yy} width={bar} height={251 - yy} rx="4" fill={color}><title>{key}: {row[key]}</title></rect>; })}<text className="dashaxis" x={center} y="275" textAnchor="middle">{row.label}</text></g>; })}
  </svg>;
}

export default function Dashboard({ data, go, openLead }) {
  const totals = financeTotals(data);
  const rows = chartRows(data);
  const current = rows.at(-1) || { revenue: 0, investment: 0, net: 0, leads: 0, calls: 0, converted: 0 };
  const previous = rows.at(-2) || { net: 0 };
  const delta = current.net - previous.net;
  const invoices = data.documents.filter(doc => ['invoice', 'sales_invoice'].includes(doc.kind) && doc.status !== 'cancelled');
  const billed = invoices.reduce((sum, doc) => sum + documentTotals(doc).grand, 0);
  const paid = invoices.reduce((sum, doc) => sum + Number(doc.paid || 0), 0);
  const completed = data.tasks.filter(task => task.status === 'Completed' && dateKey(task.completedAt || task.due) === rows.at(-1)?.key).length;
  const followups = data.leads.filter(lead => lead.follow && !['Converted / Payment Done', 'Archived'].includes(normaliseStage(lead.stage))).sort((a, b) => `${a.follow}${a.followTime || ''}`.localeCompare(`${b.follow}${b.followTime || ''}`)).slice(0, 7);
  const stageCounts = STAGES.map(([stage]) => data.leads.filter(lead => normaliseStage(lead.stage) === stage).length);
  const maxStage = Math.max(1, ...stageCounts);

  return (
    <section className="page active" id="overview">
      <div className="softwarebar"><div className="v68-page-heading"><span>Business overview</span><h1>Dashboard</h1></div><div className="actions"><select className="filter" defaultValue="6"><option value="6">6 months</option><option value="12">12 months</option></select><button className="btn" onClick={() => go('finance')}>Finance</button><button className="btn dark" onClick={() => openLead()}>Add lead</button></div></div>
      <div className="overviewhero compacthero">
        <div><div className="compactnetlabel">Net cash · <span>{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span></div><strong className="compactnetvalue">{money(current.net)}</strong><div className="compactnetmeta"><span className="netbadge">{previous.net === 0 ? (current.net === 0 ? 'No movement' : 'New this month') : `${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta))} vs last month`}</span></div></div>
        <div className="herocolorstats"><div className="herocolorstat"><span>Revenue</span><strong>{money(current.revenue)}</strong></div><div className="herocolorstat"><span>Investment</span><strong>{money(current.investment)}</strong></div><div className="herocolorstat"><span>Outstanding</span><strong>{money(totals.outstanding)}</strong></div><div className="herocolorstat"><span>Converted</span><strong>{current.converted}</strong></div></div>
      </div>
      <div className="grid colourkpis"><div className="colourkpi violet"><span className="kpiicon">☎</span><label>Calls</label><strong>{current.calls}</strong></div><div className="colourkpi teal"><span className="kpiicon">＋</span><label>New leads</label><strong>{current.leads}</strong></div><div className="colourkpi sun"><span className="kpiicon">✓</span><label>Tasks done</label><strong>{completed}</strong></div><div className="colourkpi rose"><span className="kpiicon">⏰</span><label>Due today</label><strong>{data.leads.filter(lead => lead.follow === today() && !['Converted / Payment Done', 'Archived'].includes(normaliseStage(lead.stage))).length}</strong></div></div>
      <div className="grid dashboardcharts">
        <div className="card"><div className="cardhead"><div><div className="cardtitle">Finance</div></div><div className="dashlegend"><span><i style={{ background: PALETTE[0] }} />Revenue</span><span><i style={{ background: PALETTE[1] }} />Investment</span><span><i style={{ background: PALETTE[2] }} />Net</span></div></div><div className="chartcanvas"><LineChart rows={rows} /></div></div>
        <div className="card"><div className="cardhead"><div><div className="cardtitle">Activity</div></div></div><div className="chartcanvas"><BarChart rows={rows} /></div></div>
      </div>
      <div className="grid dashbottom">
        <div className="card"><div className="cardhead"><div><div className="cardtitle">Next calls</div></div><button className="btn" onClick={() => go('sales')}>Sales</button></div><div className="followqueue">{followups.length ? followups.map(lead => <button className="followitem" key={lead.id} onClick={() => openLead(lead)}><div className="followavatar">{initials(lead.name || lead.phone)}</div><div><strong>{lead.name || lead.phone}</strong><p>{lead.callStatus || 'Follow-up'} · {lead.service || 'Lead'} · {lead.phone || ''}</p></div><span className="followtime">{shortDate(lead.follow)}{lead.followTime ? ` ${lead.followTime}` : ''}</span></button>) : <div className="empty">No calls scheduled.</div>}</div></div>
        <div className="card"><div className="cardhead"><div><div className="cardtitle">Pipeline</div></div></div><div className="stageoverview">{STAGES.map(([stage, color], index) => <div className="stageoverviewrow" key={stage}><span>{stage === 'New Lead' ? 'Leads' : stage}</span><div className="stagebartrack"><div className="stagebarfill" style={{ width: `${stageCounts[index] / maxStage * 100}%`, background: color }} /></div><b>{stageCounts[index]}</b></div>)}</div></div>
        <div className="card billing-dash-card"><div className="cardhead"><div><div className="cardtitle">Bills · all-time</div><div className="cardsub">Every quotation and invoice saved on server</div></div><button className="btn" onClick={() => go('billing')}>Bills</button></div><div className="billing-dash-stats"><div><label>Total billed</label><strong>{money(billed)}</strong></div><div><label>Collected</label><strong>{money(paid)}</strong></div><div><label>Pending</label><strong>{money(Math.max(0, billed - paid))}</strong></div><div><label>Invoices</label><strong>{invoices.length}</strong></div></div></div>
      </div>
    </section>
  );
}
