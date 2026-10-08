'use client';

import { useEffect } from 'react';

export function Button({ children, variant = 'default', className = '', ...props }) {
  return <button className={`btn button ${variant === 'primary' ? 'dark button-primary' : ''} ${variant === 'danger' ? 'danger button-danger' : ''} ${className}`} {...props}>{children}</button>;
}

export function Empty({ children = 'Nothing here yet.' }) {
  return <div className="empty empty-state">{children}</div>;
}

export function Modal({ title, subtitle, onClose, wide = false, children, footer }) {
  useEffect(() => {
    const close = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div className="back show modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'large modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modalhead modal-header">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="close icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modalfoot modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({ label, hint, wide = false, children }) {
  return <div className={`field ${wide ? 'full field-wide' : ''}`}><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}

export function Avatar({ name, src, size = 'normal' }) {
  const letters = String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={`avatar avatar-${size}`}>{src ? <img src={src} alt="" /> : letters}</span>;
}

export function Metric({ label, value, tone = 'neutral', note }) {
  return <article className={`metric metric-${tone}`}><label>{label}</label><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function PageHeader({ eyebrow, title, children }) {
  return <div className="softwarebar page-header"><div className="v68-page-heading"><span>{eyebrow}</span><h1>{title}</h1></div><div className="actions page-actions">{children}</div></div>;
}

export function Search({ value, onChange, placeholder = 'Search' }) {
  return <label className="search search-box"><span>⌕</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function Progress({ value }) {
  return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
