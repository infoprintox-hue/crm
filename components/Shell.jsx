'use client';

import { useEffect, useRef } from 'react';
import { ACCESS, initials, PAGE_LABELS } from '@/lib/client/business';

const NAV_ICONS = {
  overview: <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z" />,
  sales: <><path d="M4 16.5 9.2 11l3.4 3.3L20 7" /><path d="M14.2 7H20v5.8" /></>,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 2.6 2.6L16.4 9" /></>,
  clients: <><circle cx="9" cy="8" r="3" /><path d="M4 19c0-2.6 2.2-4.7 5-4.7s5 2.1 5 4.7" /><circle cx="16.4" cy="8.4" r="2.3" /><path d="M16.2 14.4c2.2.4 3.8 2.2 3.8 4.6" /></>,
  billing: <><path d="M7 3.8h10a1.6 1.6 0 0 1 1.6 1.6V20L17 18l-2 2-2-2-2 2-2-2-2 2V5.4A1.6 1.6 0 0 1 7 3.8z" /><path d="M9.2 8.5h5.6M9.2 12h5.6M9.2 15.4h3.4" /></>,
  finance: <><circle cx="12" cy="12" r="8.2" /><path d="M9.2 8.4h5.2M9.2 12h5.2M12.2 8.4v7.4M9.4 15.8h3.4" /></>,
  collection: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4v5l3.2 1.8" /></>,
  team: <><circle cx="8.2" cy="8.2" r="2.4" /><circle cx="15.8" cy="8.2" r="2.4" /><path d="M3.8 18.6c.3-2.4 2.3-4.2 4.4-4.2s4.1 1.8 4.4 4.2M11.4 18.6c.3-2.4 2.3-4.2 4.4-4.2s4.1 1.8 4.4 4.2" /></>,
};

export default function Shell({ user, page, setPage, saving, theme, setTheme, onLogout, onSecurity, data, onRestore, children }) {
  const pages = ACCESS[user.role] || ACCESS.team;
  const restoreRef = useRef(null);

  useEffect(() => {
    const roleClass = `vlos-${user.role}-role`;
    document.body.dataset.theme = theme;
    document.body.classList.add('v68-ui', roleClass);
    return () => document.body.classList.remove(roleClass);
  }, [theme, user.role]);

  function backup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `visitinglink-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function restore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await onRestore(parsed);
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="app-shell">
      <header className="top pixelappbar">
        <div className="topin pixelappbarin">
          <button className="brand pixelbrand vlos-brand" onClick={() => setPage(pages[0])} aria-label="Visitinglink home">
            <img className="vlos-header-logo" src="/assets/visitinglink-logo-black.png" alt="Visitinglink" />
          </button>
          <nav className="nav pixelnav apple-top-slider" aria-label="Primary navigation">
            {pages.map(item => (
              <button type="button" key={item} data-page={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>
                <svg className="vl-nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{NAV_ICONS[item]}</svg>
                <span>{PAGE_LABELS[item]}</span>
              </button>
            ))}
          </nav>
          <div className="topact pixelactions">
            <span className={`vl-sync-state ${saving ? 'saving' : ''}`}><i />{saving ? 'Saving…' : 'Saved'}</span>
            <span className="vlos-role-chip">{user.role === 'teamlead' ? 'Manager' : user.role === 'subadmin' ? 'Sub Admin' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span>
            <button className="pixeliconbtn" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Switch light or dark mode">{theme === 'dark' ? '☀' : '☾'}</button>
            {user.role === 'admin' && <button className="pixelquietbtn vlos-export-control" type="button" onClick={backup}>Backup</button>}
            {user.role === 'admin' && <button className="pixelquietbtn vlos-export-control" type="button" onClick={() => restoreRef.current?.click()}>Restore</button>}
            {user.role === 'admin' && <button className="pixelquietbtn vlos-security-control" type="button" onClick={onSecurity} title="Password and active sessions"><span aria-hidden="true">🔒</span> Security</button>}
            <input ref={restoreRef} type="file" accept=".json,application/json" hidden onChange={restore} />
            <button className="pixelavatar vlos-jv-avatar" type="button" onClick={onLogout} title="Logout">{user.role === 'admin' ? 'JV' : initials(user.name)}</button>
          </div>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </div>
  );
}
