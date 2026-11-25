'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';
import { useApp } from '@/components/Providers';
import type { Key } from '@/lib/i18n';

const NAV: [string, Key][] = [
  ['/dashboard', 'dashboard'], ['/sales', 'sales'], ['/customers', 'customers'], ['/products', 'products'],
  ['/representatives', 'representatives'], ['/employees', 'employees'], ['/reports', 'reports'],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, toggleLang, cycleTheme, theme } = useApp();
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">{t('appName')}</div>
        {NAV.map(([href, key]) => (
          <Link key={href} href={href} className={`nav${path.startsWith(href) ? ' active' : ''}`}>{t(key)}</Link>
        ))}
      </nav>
      <main className="main">
        <div className="top">
          <button className="btn ghost" onClick={toggleLang}>{t('language')}</button>
          <button className="btn ghost" onClick={cycleTheme}>{t('theme')}: {theme}</button>
          <button className="btn ghost" onClick={logout}>{t('logout')}</button>
        </div>
        {children}
      </main>
    </div>
  );
}
