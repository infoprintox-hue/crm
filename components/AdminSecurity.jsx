'use client';

import { useState } from 'react';
import { Button, Field, Modal } from './ui';

function PasswordInput({ visible, onToggle, label, ...props }) {
  return (
    <div className="password-control">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5 9 5a15.8 15.8 0 0 1-2.1 2.6M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5 9 5a10.5 10.5 0 0 0 4.1-.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function AdminSecurity({ saving, onClose, onChangePassword, onLogoutOthers, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');

  const toggleVisibility = field => setVisible(current => ({ ...current, [field]: !current[field] }));

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('New password and confirmation do not match.');
    const ok = await onChangePassword(currentPassword, newPassword);
    if (ok) onClose();
  }

  async function logoutOthers() {
    setError('');
    const ok = await onLogoutOthers();
    if (ok) onClose();
  }

  return (
    <Modal title="Admin security" subtitle="Control the software password and active sessions." onClose={onClose}>
      <div className="admin-security">
        <form className="admin-security-card" onSubmit={changePassword}>
          <div className="admin-security-heading">
            <span className="admin-security-icon" aria-hidden="true">🔐</span>
            <div><h4>Change admin password</h4><p>The new password is saved securely on the server. All other signed-in devices are logged out automatically.</p></div>
          </div>
          <div className="form form-grid admin-security-fields">
            <Field label="Current password" wide><PasswordInput label="current password" visible={visible.current} onToggle={() => toggleVisibility('current')} autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></Field>
            <Field label="New password"><PasswordInput label="new password" visible={visible.next} onToggle={() => toggleVisibility('next')} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required /></Field>
            <Field label="Confirm new password"><PasswordInput label="password confirmation" visible={visible.confirm} onToggle={() => toggleVisibility('confirm')} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required /></Field>
          </div>
          {error && <p className="admin-security-error" role="alert">{error}</p>}
          <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</Button>
        </form>

        <section className="admin-security-card admin-security-sessions">
          <div className="admin-security-heading">
            <span className="admin-security-icon" aria-hidden="true">🛡️</span>
            <div><h4>Active sessions</h4><p>Use this if a password or device may be compromised. Your current device stays signed in.</p></div>
          </div>
          <div className="admin-security-actions">
            <Button type="button" variant="danger" onClick={logoutOthers} disabled={saving}>Logout all other devices</Button>
            <Button type="button" onClick={onLogout} disabled={saving}>Logout this device</Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
