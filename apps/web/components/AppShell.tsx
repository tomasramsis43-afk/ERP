'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconName } from './Icon';
import { useApp } from './Providers';
import { useApi, useDebounced, useMe, can } from '@/lib/hooks';
import { initials } from '@/lib/format';

interface NavItem {
  href: string;
  ar: string;
  en: string;
  icon: IconName;
  perm?: string;
  exact?: boolean;
}
interface NavGroup {
  ar: string;
  en: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    ar: 'الرئيسية',
    en: 'Overview',
    items: [{ href: '/dashboard', ar: 'لوحة التحكم', en: 'Dashboard', icon: 'dashboard', perm: 'reports:view' }],
  },
  {
    ar: 'المبيعات',
    en: 'Sales',
    items: [
      { href: '/sales', ar: 'فواتير ومرتجعات البيع', en: 'Sales & returns', icon: 'cart', perm: 'sales:view' },
      { href: '/customers', ar: 'العملاء', en: 'Customers', icon: 'users', perm: 'customers:view' },
    ],
  },
  {
    ar: 'المشتريات',
    en: 'Purchasing',
    items: [
      { href: '/purchases', ar: 'فواتير ومرتجعات الشراء', en: 'Purchases & returns', icon: 'truck', perm: 'purchases:view' },
      { href: '/suppliers', ar: 'الموردون', en: 'Suppliers', icon: 'building', perm: 'suppliers:view' },
    ],
  },
  {
    ar: 'المخزون',
    en: 'Inventory',
    items: [
      { href: '/products', ar: 'الأصناف', en: 'Products', icon: 'box', perm: 'products:view' },
      { href: '/catalog', ar: 'الوحدات والتصنيفات', en: 'Units & categories', icon: 'package', perm: 'products:view' },
      { href: '/warehouses', ar: 'المخازن', en: 'Warehouses', icon: 'warehouse', perm: 'inventory:view' },
      { href: '/inventory', ar: 'أرصدة وحركة المخزون', en: 'Stock & movements', icon: 'layers', perm: 'inventory:view' },
    ],
  },
  {
    ar: 'التوزيع والمناديب',
    en: 'Distribution',
    items: [
      { href: '/representatives', ar: 'المناديب والعهد', en: 'Representatives', icon: 'id', perm: 'representatives:view' },
      { href: '/vehicles', ar: 'السيارات والمصروفات', en: 'Vehicles', icon: 'truck', perm: 'vehicles:view' },
      { href: '/routes', ar: 'المناطق وخطوط السير', en: 'Areas & routes', icon: 'route', perm: 'routes:view' },
    ],
  },
  {
    ar: 'الخزينة',
    en: 'Treasury',
    items: [{ href: '/treasury', ar: 'الخزائن والبنوك والشيكات', en: 'Cash, banks & cheques', icon: 'wallet', perm: 'treasury:view' }],
  },
  {
    ar: 'المحاسبة',
    en: 'Accounting',
    items: [
      { href: '/accounting/accounts', ar: 'شجرة الحسابات', en: 'Chart of accounts', icon: 'book', perm: 'accounting:view' },
      { href: '/accounting/journal', ar: 'القيود اليومية', en: 'Journal entries', icon: 'clipboard', perm: 'accounting:view' },
      { href: '/accounting/ledger', ar: 'ميزان المراجعة والأستاذ', en: 'Trial balance & ledger', icon: 'chart', perm: 'accounting:view' },
    ],
  },
  {
    ar: 'التقارير',
    en: 'Reports',
    items: [{ href: '/reports', ar: 'القوائم والتقارير المالية', en: 'Financial statements', icon: 'trending', perm: 'reports:view' }],
  },
  {
    ar: 'الموارد البشرية',
    en: 'HR',
    items: [{ href: '/hr', ar: 'الموظفون والمرتبات', en: 'Employees & payroll', icon: 'user', perm: 'hr:view' }],
  },
  {
    ar: 'الإدارة',
    en: 'Administration',
    items: [{ href: '/admin', ar: 'المستخدمون والصلاحيات', en: 'Users & permissions', icon: 'shield', perm: 'users:view' }],
  },
];

const TITLES: { prefix: string; ar: string; en: string }[] = [
  { prefix: '/dashboard', ar: 'لوحة التحكم', en: 'Dashboard' },
  { prefix: '/sales', ar: 'المبيعات', en: 'Sales' },
  { prefix: '/purchases', ar: 'المشتريات', en: 'Purchases' },
  { prefix: '/customers', ar: 'العملاء', en: 'Customers' },
  { prefix: '/suppliers', ar: 'الموردون', en: 'Suppliers' },
  { prefix: '/products', ar: 'الأصناف', en: 'Products' },
  { prefix: '/catalog', ar: 'الوحدات والتصنيفات', en: 'Units & categories' },
  { prefix: '/warehouses', ar: 'المخازن', en: 'Warehouses' },
  { prefix: '/inventory', ar: 'المخزون', en: 'Inventory' },
  { prefix: '/representatives', ar: 'المناديب', en: 'Representatives' },
  { prefix: '/vehicles', ar: 'السيارات', en: 'Vehicles' },
  { prefix: '/routes', ar: 'خطوط السير', en: 'Routes' },
  { prefix: '/treasury', ar: 'الخزينة والبنوك', en: 'Treasury' },
  { prefix: '/accounting/accounts', ar: 'شجرة الحسابات', en: 'Chart of accounts' },
  { prefix: '/accounting/journal', ar: 'القيود اليومية', en: 'Journal entries' },
  { prefix: '/accounting/ledger', ar: 'ميزان المراجعة والأستاذ', en: 'Trial balance' },
  { prefix: '/reports', ar: 'التقارير', en: 'Reports' },
  { prefix: '/hr', ar: 'الموارد البشرية', en: 'Human resources' },
  { prefix: '/admin', ar: 'الإدارة والصلاحيات', en: 'Administration' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { tr, lang, toggleLang, theme, cycleTheme } = useApp();
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleNav = useMemo(
    () =>
      NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || !me || can(me, i.perm)) })).filter((g) => g.items.length > 0),
    [me],
  );

  const title = TITLES.filter((t) => path.startsWith(t.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  const roleLabel = me?.roles?.[0] ? roleText(me.roles[0], tr) : '';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <div className="app">
      <div className={`side-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="side-brand">
          <div className="brand-mark">
            <Icon name="chart" size={21} />
          </div>
          <div>
            <div className="brand-text">{tr('نظام الإدارة', 'Business Suite')}</div>
            <div className="brand-sub">ERP · {tr('توزيع وتجارة', 'Distribution')}</div>
          </div>
        </div>
        <div className="side-scroll">
          {visibleNav.map((group) => (
            <div className="nav-group" key={group.ar}>
              <div className="nav-group-title">{tr(group.ar, group.en)}</div>
              {group.items.map((item) => {
                const active = item.href === '/dashboard' || item.href === '/reports' ? path === item.href : path.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
                    <Icon name={item.icon} />
                    <span>{tr(item.ar, item.en)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="side-foot">
          <div className="user-chip">
            <div className="avatar">{initials(me?.email?.split('@')[0]?.replace(/[._]/g, ' '))}</div>
            <div className="user-meta">
              <div className="user-name">{me?.email?.split('@')[0] ?? '—'}</div>
              <div className="user-role">{roleLabel}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="القائمة">
            <Icon name="menu" />
          </button>
          <div>
            <div className="topbar-title">{title ? tr(title.ar, title.en) : tr('نظام الإدارة', 'Business Suite')}</div>
            <div className="crumb">{tr('الرئيسية', 'Home')} / {title ? tr(title.ar, title.en) : ''}</div>
          </div>
          <div className="topbar-spacer" />
          <button className="search-global" onClick={() => setSearchOpen(true)} style={{ cursor: 'pointer' }}>
            <Icon name="search" size={16} />
            <span style={{ flex: 1, textAlign: 'start' }}>{tr('بحث سريع…', 'Quick search…')}</span>
            <kbd style={{ fontSize: 10, opacity: .6 }}>Ctrl K</kbd>
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn ghost" onClick={() => setQuickOpen((v) => !v)}>
              <Icon name="plus" size={15} />
              {tr('إضافة', 'New')}
              <Icon name="chevron-down" size={13} />
            </button>
            {quickOpen ? (
              <div
                className="card"
                style={{ position: 'absolute', insetInlineEnd: 0, top: 44, width: 220, zIndex: 50, padding: 6, boxShadow: 'var(--shadow-lg)' }}
                onMouseLeave={() => setQuickOpen(false)}
              >
                {[
                  ['/sales?new=1', 'فاتورة بيع', 'Sales invoice', 'cart'],
                  ['/purchases?new=1', 'فاتورة شراء', 'Purchase invoice', 'truck'],
                  ['/treasury?tab=vouchers&new=1', 'سند قبض / صرف', 'Receipt / payment', 'receipt'],
                  ['/accounting/journal?new=1', 'قيد يومية', 'Journal entry', 'clipboard'],
                  ['/customers?new=1', 'عميل جديد', 'New customer', 'users'],
                ].map(([href, ar, en, ic]) => (
                  <Link key={href} href={href} className="nav-item" style={{ color: 'var(--text)', padding: '8px 10px' }} onClick={() => setQuickOpen(false)}>
                    <Icon name={ic as IconName} size={16} />
                    <span>{tr(ar, en)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <button className="icon-btn" onClick={toggleLang} title={tr('English', 'العربية')}>
            <Icon name="globe" size={17} />
          </button>
          <button className="icon-btn" onClick={cycleTheme} title={tr('المظهر', 'Theme')}>
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={17} />
          </button>
          <button className="icon-btn" onClick={logout} title={tr('خروج', 'Sign out')}>
            <Icon name="logout" size={17} />
          </button>
        </header>
        <main className="content">{children}</main>
      </div>

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function roleText(code: string, tr: (a: string, e: string) => string): string {
  const map: Record<string, [string, string]> = {
    SYSTEM_ADMIN: ['مدير النظام', 'System administrator'],
    GENERAL_MANAGER: ['المدير العام', 'General manager'],
    ACCOUNTANT: ['المحاسب', 'Accountant'],
    WAREHOUSE_KEEPER: ['أمين المخزن', 'Warehouse keeper'],
    SALES_MANAGER: ['مسؤول المبيعات', 'Sales manager'],
    PURCHASING_MANAGER: ['مسؤول المشتريات', 'Purchasing manager'],
    REPRESENTATIVE: ['المندوب', 'Representative'],
    HR: ['الموارد البشرية', 'Human resources'],
  };
  const v = map[code];
  return v ? tr(v[0], v[1]) : code;
}

interface SearchRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
}

function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr, lang } = useApp();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const customers = useApi<{ items: SearchRow[] }>(open && debounced ? `customers?q=${encodeURIComponent(debounced)}&pageSize=5` : null);
  const products = useApi<{ items: SearchRow[] }>(open && debounced ? `products?q=${encodeURIComponent(debounced)}&pageSize=5` : null);
  const suppliers = useApi<{ items: SearchRow[] }>(open && debounced ? `suppliers?q=${encodeURIComponent(debounced)}&pageSize=5` : null);

  useEffect(() => {
    if (open) {
      setQ('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const groups: { title: string; rows: SearchRow[]; href: (r: SearchRow) => string }[] = [
    { title: tr('العملاء', 'Customers'), rows: customers.data?.items ?? [], href: (r) => `/customers?id=${r.id}` },
    { title: tr('الموردون', 'Suppliers'), rows: suppliers.data?.items ?? [], href: (r) => `/suppliers?id=${r.id}` },
    { title: tr('الأصناف', 'Products'), rows: products.data?.items ?? [], href: (r) => `/products?id=${r.id}` },
  ];
  const none = groups.every((g) => g.rows.length === 0);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-body" style={{ padding: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <Icon name="search" size={18} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('ابحث عن عميل، مورد، أو صنف…', 'Search customers, suppliers, products…')}
              style={{ border: 0, outline: 0, background: 'transparent', color: 'var(--text)', fontSize: 15, width: '100%' }}
            />
            <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
            {!debounced ? (
              <div className="empty" style={{ padding: 28 }}>{tr('اكتب للبحث في كل بياناتك', 'Type to search across your data')}</div>
            ) : none ? (
              <div className="empty" style={{ padding: 28 }}>{tr('لا نتائج', 'No results')}</div>
            ) : (
              groups.map((g) =>
                g.rows.length ? (
                  <div key={g.title}>
                    <div className="nav-group-title" style={{ color: 'var(--sub)', padding: '8px 10px 4px' }}>{g.title}</div>
                    {g.rows.map((r) => (
                      <Link key={r.id} href={g.href(r)} className="nav-item" style={{ color: 'var(--text)' }} onClick={onClose}>
                        <span className="tree-code">{r.code}</span>
                        <span>{lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr}</span>
                        <Icon name="chevron-end" size={14} style={{ marginInlineStart: 'auto', opacity: .5 }} />
                      </Link>
                    ))}
                  </div>
                ) : null,
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
