'use client';

import React, { useEffect } from 'react';
import { formatDate, formatMoney, formatQty } from '@/lib/format';
import { Icon, IconName } from './Icon';

/* ---------------------------------------------------------------- buttons */

type BtnVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'danger-ghost';
export function Button({
  children,
  variant = 'primary',
  size,
  icon,
  loading,
  block,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'lg';
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`btn ${variant === 'primary' ? '' : variant} ${size ?? ''} ${block ? 'block' : ''} ${className}`}
    >
      {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  title,
  danger,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; title: string; danger?: boolean }) {
  return (
    <button {...rest} title={title} aria-label={title} className={`mini-btn${danger ? ' danger' : ''}`}>
      <Icon name={icon} />
    </button>
  );
}

/* ------------------------------------------------------------------ cards */

export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function CardHead({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title">{title}</div>
        {sub ? <div className="card-sub">{sub}</div> : null}
      </div>
      {children ? <div className="card-actions">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <div className="page-sub">{sub}</div> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({
  label,
  required,
  hint,
  error,
  className = 'col-4',
  children,
}: {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label>
          {label}
          {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div className="err-text">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} {...props} className={`input ${props.className ?? ''}`} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} {...props} className={`select ${props.className ?? ''}`} />;
});

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${props.className ?? ''}`} />;
}

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn modal-close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ table */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  align?: 'start' | 'end' | 'center';
  width?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  footer,
  compact,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="table" style={compact ? { fontSize: 12.5 } : undefined}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align ?? 'start' }} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="loading-box"><span className="spinner" /> جارٍ التحميل…</div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <EmptyState />}</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align ?? 'start' }} className={c.className}>
                    {c.render(r, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', sub }: { title?: string; sub?: string }) {
  return (
    <div className="empty">
      <Icon name="file" size={40} />
      <div className="empty-title">{title}</div>
      {sub ? <div className="empty-sub">{sub}</div> : null}
    </div>
  );
}

export function Loading({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="loading-box">
      <span className="spinner" /> {label}
    </div>
  );
}

/* ------------------------------------------------------------------ pager */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="info">
        {from}–{to} من {total}
      </span>
      {onPageSize ? (
        <select className="select" style={{ width: 80, height: 30, padding: '0 8px' }} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : null}
      <span className="spacer" />
      <Button variant="ghost" size="sm" icon="chevron-start" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        السابق
      </Button>
      <span className="info">{page} / {pages}</span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        التالي <Icon name="chevron-end" size={14} />
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- display */

export function Money({ value, className = '', bold }: { value: string | number | null | undefined; className?: string; bold?: boolean }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  const n = Number(value);
  return (
    <span className={`mono ${n < 0 ? 'neg' : ''} ${bold ? 'fw-600' : ''} ${className}`} dir="ltr">
      {formatMoney(value)}
    </span>
  );
}

export function Qty({ value }: { value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  return <span className="mono" dir="ltr">{formatQty(value)}</span>;
}

export function DateText({ value }: { value: string | Date | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="mono" dir="ltr">{formatDate(value)}</span>;
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'primary' | 'muted';
export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={`badge ${tone === 'muted' ? '' : tone}`}><span className="dot" />{children}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  delta,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconName;
  tone?: 'warn' | 'danger' | 'info';
  /** Percentage change against a comparison period; null/undefined hides it. `invert` flips good/bad (e.g. purchases). */
  delta?: { pct: number | null; label: string; invert?: boolean } | null;
}) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      {icon ? <div className="kpi-icon"><Icon name={icon} /></div> : null}
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {hint ? <div className="kpi-hint">{hint}</div> : null}
        {delta && delta.pct !== null ? (
          <div className="kpi-hint" style={{ fontWeight: 600, color: (delta.pct >= 0) !== !!delta.invert ? 'var(--ok, #15803d)' : 'var(--danger, #b91c1c)' }}>
            {delta.pct >= 0 ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(1)}% <span style={{ fontWeight: 400, color: 'var(--sub)' }}>{delta.label}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: React.ReactNode; badge?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab${value === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge ? <span className="badge" style={{ marginInlineStart: 6 }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function DetailGrid({ items }: { items: { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <div className="detail-grid">
      {items.map((it, i) => (
        <div className="detail-item" key={i}>
          <div className="detail-label">{it.label}</div>
          <div className="detail-value">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function SummaryStrip({ items }: { items: { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <div className="summary-strip">
      {items.map((it, i) => (
        <div className="summary-cell" key={i}>
          <div className="label">{it.label}</div>
          <div className="value">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'error' | 'ok' | 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div className={`alert ${tone}`}>
      <Icon name={tone === 'error' ? 'alert' : tone === 'ok' ? 'check-circle' : 'info'} size={16} style={{ marginTop: 1, flex: '0 0 16px' }} />
      <div>{children}</div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <Alert tone="error">{error}</Alert>;
}
