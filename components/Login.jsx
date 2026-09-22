'use client';

import { useMemo, useState } from 'react';

const MODES = [
  ['admin', 'Admin'],
  ['fulladmin', 'Full Admin'],
  ['subadmin', 'Sub Admin'],
  ['sales', 'Sales'],
  ['teamlead', 'Manager'],
  ['team', 'Team'],
];

const SCOPES = {
  fulladmin: 'Poora software: Dashboard se Team tak sab.',
  subadmin: 'Business run: Dashboard, Sales, Tasks, Clients, Bills, Finance, Collection. Team/Backup nahi.',
  sales: 'Sirf Admin-assigned leads. Number access one-by-one logged rahega.',
  teamlead: 'Sirf Tasks / Manager view.',
  team: 'Sirf aapke assigned tasks. Baaki software hidden.',
};

export default function Login({ members, busy, error, onLogin }) {
  const [mode, setMode] = useState('admin');
  const [password, setPassword] = useState('');
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const memberRole = mode === 'fulladmin' ? 'admin' : mode;
  const matching = useMemo(() => members.filter(member => member.accessRole === memberRole), [members, memberRole]);
  const isOwnerAdmin = mode === 'admin';

  async function submit(event) {
    event.preventDefault();
    await onLogin(isOwnerAdmin ? { role: 'admin', password } : { role: memberRole, memberId, pin });
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setMemberId('');
    setSecretVisible(false);
  }

  return (
    <div className="login show" id="login">
      <div className="logincard vlos-logincard">
        <div className="loginlogo">VL</div>
        <h2>Visitinglink</h2>
        <p>Apna role chuno, phir login. Phone aur laptop pe same kaam khulega.</p>
        <div className="vl-login-switch vl-login-switch-6">
          {MODES.map(([value, label]) => (
            <button type="button" key={value} className={mode === value ? 'active' : ''} onClick={() => chooseMode(value)}>{label}</button>
          ))}
        </div>
        <form id="vlLoginForm" onSubmit={submit}>
          {isOwnerAdmin ? (
            <div id="vlAdminFields">
              <div className="vl-login-field">
                <label htmlFor="vlAdminPassword">Password</label>
                <div className="vl-secret-wrap">
                  <input id="vlAdminPassword" name="password" type={secretVisible ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="off" spellCheck="false" enterKeyHint="go" placeholder="Password likho" value={password} onChange={event => setPassword(event.target.value)} />
                  <button type="button" className={`vl-eye ${secretVisible ? 'is-on' : ''}`} onClick={() => setSecretVisible(value => !value)} aria-label={secretVisible ? 'Hide admin password' : 'Show admin password'} title={secretVisible ? 'Hide password' : 'Show password'}>◉</button>
                </div>
              </div>
            </div>
          ) : (
            <div id="vlMemberFields">
              <div className="vl-login-field">
                <label htmlFor="vlTeamMemberSelect">Aapka naam</label>
                <select id="vlTeamMemberSelect" value={memberId} onChange={event => setMemberId(event.target.value)} required>
                  <option value="">Select member</option>
                  {matching.map(member => <option key={member.id} value={member.id}>{member.name} — {member.role || 'Team'}</option>)}
                </select>
              </div>
              <div className="vl-login-field">
                <label htmlFor="vlTeamPin">PIN</label>
                <div className="vl-secret-wrap">
                  <input id="vlTeamPin" name="pin" type={secretVisible ? 'text' : 'password'} inputMode="numeric" autoComplete="off" autoCapitalize="off" placeholder="PIN likho" value={pin} onChange={event => setPin(event.target.value)} />
                  <button type="button" className={`vl-eye ${secretVisible ? 'is-on' : ''}`} onClick={() => setSecretVisible(value => !value)} aria-label={secretVisible ? 'Hide login PIN' : 'Show login PIN'} title={secretVisible ? 'Hide PIN' : 'Show PIN'}>◉</button>
                </div>
              </div>
              <div className="vl-login-scope">{SCOPES[mode]}</div>
            </div>
          )}
          <div className="vl-login-error" id="vlLoginError">{error || ''}</div>
          <button className="btn dark" id="vlLoginButton" type="submit" style={{ width: '100%', marginTop: 4 }} disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
        </form>
      </div>
    </div>
  );
}
