'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useApp } from '@/components/Providers';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { tr, lang, toggleLang } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace('/dashboard');
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? tr('بيانات الدخول غير صحيحة', 'Invalid email or password'));
      }
    } catch {
      setError(tr('تعذر الاتصال بالخادم', 'Could not reach the server'));
    } finally {
      setBusy(false);
    }
  }

  const feats = [
    [tr('محاسبة متكاملة وقيود تلقائية', 'Full accounting with automatic journals'), 'book'],
    [tr('مخزون وعهد مناديب وسيارات', 'Inventory, representative and vehicle custody'), 'truck'],
    [tr('تقارير مالية وربحية لحظية', 'Live financial and profitability reports'), 'chart'],
    [tr('صلاحيات وسجل رقابة لكل حركة', 'Permissions and a full audit trail'), 'shield'],
  ] as const;

  return (
    <div className="login-page">
      <div className="login-art">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div className="brand-mark" style={{ width: 42, height: 42, flexBasis: 42 }}>
            <Icon name="chart" size={23} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{tr('نظام الإدارة المتكامل', 'Business Suite')}</div>
            <div style={{ fontSize: 11.5, color: '#7fa8a5' }}>ERP · {tr('توزيع وتجارة', 'Distribution & trade')}</div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>{tr('كل أعمالك في مكان واحد.', 'Your whole business in one place.')}</h1>
          <p>
            {tr(
              'من أمر البيع إلى التحصيل، ومن تحميل السيارة إلى تقفيل اليومية، ومن القيد إلى القائمة المالية — نظام واحد يربط كل الأرقام ببعضها.',
              'From the sales order to the collection, from loading the van to the daily closing, from the journal to the financial statements — one system that keeps every number connected.',
            )}
          </p>
          <div className="login-feats">
            {feats.map(([label, icon]) => (
              <div className="login-feat" key={label}>
                <Icon name={icon as 'book'} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#6d9290', position: 'relative', zIndex: 1 }}>
          {tr('النسخة 2.0 · قاعدة عملة الجنيه المصري', 'Version 2.0 · Base currency EGP')}
        </div>
      </div>

      <div className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <div className="brand-mark" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', boxShadow: 'none' }}>
              <Icon name="chart" size={20} />
            </div>
            <button type="button" className="btn ghost sm" onClick={toggleLang}>
              <Icon name="globe" size={14} />
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>
          <h2>{tr('تسجيل الدخول', 'Sign in')}</h2>
          <div className="sub">{tr('أدخل بيانات حسابك للوصول إلى النظام', 'Enter your account details to continue')}</div>

          <Field label={tr('البريد الإلكتروني', 'Email')}>
            <Input
              type="email"
              required
              autoComplete="username"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ direction: 'ltr' }}
            />
          </Field>
          <Field label={tr('كلمة المرور', 'Password')}>
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ direction: 'ltr' }}
            />
          </Field>

          {error ? (
            <div className="alert error" style={{ marginBottom: 14 }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" block size="lg" loading={busy}>
            {tr('دخول', 'Sign in')}
          </Button>
          <div className="login-foot">
            {tr('بالدخول أنت توافق على سياسات الشركة وسجل الرقابة.', 'By signing in you accept the company policies and audit trail.')}
          </div>
        </form>
      </div>
    </div>
  );
}
