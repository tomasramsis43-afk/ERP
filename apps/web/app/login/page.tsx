'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useApp } from '@/components/Providers';

export default function LoginPage() {
  const { t, toggleLang } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (res.ok) router.replace('/dashboard');
    else setError(true);
  }

  return (
    <form className="login card" onSubmit={submit}>
      <h1>{t('appName')}</h1>
      <input type="email" required autoComplete="username" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" required autoComplete="current-password" placeholder={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p className="error">{t('loginFailed')}</p> : null}
      <button className="btn" disabled={busy} type="submit">{t('login')}</button>{' '}
      <button className="btn ghost" type="button" onClick={toggleLang}>{t('language')}</button>
    </form>
  );
}
