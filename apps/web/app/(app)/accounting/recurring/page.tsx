'use client';

import React, { useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Button, Card, DataTable, DateText, EmptyState, ErrorNote, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { post, uuid } from '@/lib/api';
import { today } from '@/lib/format';

interface Account { id: string; code: string; nameAr: string; nameEn: string }
interface Template {
  id: string;
  code: string;
  description: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  nextRunDate: string;
  lastRunDate: string | null;
  isActive: boolean;
}

export default function RecurringJournalsPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const templates = useApi<Template[]>('accounting/recurring');
  const accounts = useApi<Account[]>('accounting/accounts');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [nextRunDate, setNextRunDate] = useState(today());
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');
  const [amount, setAmount] = useState('');

  const name = (a: Account) => `${a.code} · ${lang === 'ar' ? a.nameAr : a.nameEn}`;

  async function create() {
    if (!debitAccount || !creditAccount || debitAccount === creditAccount) {
      setError(tr('اختر حسابين مختلفين للمدين والدائن', 'Choose two different debit and credit accounts'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('accounting/recurring', {
        code: code || `REC-${uuid().slice(0, 8)}`,
        description,
        frequency,
        dayOfMonth: frequency === 'MONTHLY' ? Number(dayOfMonth) : undefined,
        dayOfWeek: frequency === 'WEEKLY' ? Number(dayOfWeek) : undefined,
        nextRunDate,
        lines: [
          { accountId: debitAccount, debit: amount, credit: '0.00' },
          { accountId: creditAccount, debit: '0.00', credit: amount },
        ],
      });
      toast.success(tr('تم إنشاء القيد الدوري', 'Recurring template created'));
      setOpen(false);
      templates.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(id: string) {
    try {
      await post(`accounting/recurring/${id}/run`, {});
      toast.success(tr('تم ترحيل القيد', 'Entry posted'));
      templates.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title={tr('القيود الدورية', 'Recurring journals')}
        sub={tr('قوالب قيود متوازنة تُرحّل تلقائيًا حسب الجدول الزمني', 'Balanced templates posted automatically on schedule')}
      >
        <Button icon="plus" onClick={() => setOpen(true)}>{tr('قالب جديد', 'New template')}</Button>
      </PageHeader>
      <Card>
        <ErrorNote error={templates.error} />
        <DataTable<Template>
          rows={templates.data ?? []}
          rowKey={(r) => r.id}
          columns={[
            { key: 'code', header: tr('الكود', 'Code'), render: (r) => r.code },
            { key: 'description', header: tr('الوصف', 'Description'), render: (r) => r.description },
            { key: 'frequency', header: tr('التكرار', 'Frequency'), render: (r) => r.frequency },
            { key: 'next', header: tr('الموعد التالي', 'Next run'), render: (r) => <DateText value={r.nextRunDate} /> },
            { key: 'last', header: tr('آخر ترحيل', 'Last run'), render: (r) => (r.lastRunDate ? <DateText value={r.lastRunDate} /> : '—') },
            { key: 'run', header: tr('تنفيذ', 'Run'), render: (r) => <Button variant="ghost" onClick={() => run(r.id)}>{tr('ترحيل الآن', 'Run now')}</Button> },
          ]}
          empty={<EmptyState title={tr('لا توجد قوالب', 'No templates')} sub={tr('أنشئ قالبًا للإيجار أو الرواتب أو الاستحقاقات', 'Create a template for rent, salaries or accruals')} />}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('قالب قيد جديد', 'New recurring template')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{tr('تراجع', 'Back')}</Button><Button loading={busy} onClick={create}>{tr('حفظ', 'Save')}</Button></>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label={tr('الوصف', 'Description')}><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label={tr('التكرار', 'Frequency')}>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="DAILY">{tr('يومي', 'Daily')}</option>
              <option value="WEEKLY">{tr('أسبوعي', 'Weekly')}</option>
              <option value="MONTHLY">{tr('شهري', 'Monthly')}</option>
            </Select>
          </Field>
          {frequency === 'MONTHLY' ? <Field label={tr('يوم الشهر', 'Day of month')}><Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></Field> : null}
          {frequency === 'WEEKLY' ? <Field label={tr('يوم الأسبوع (0 = الأحد)', 'Day of week (0 = Sunday)')}><Input type="number" min={0} max={6} value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} /></Field> : null}
          <Field label={tr('الموعد التالي', 'Next run')}><Input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
          <Field label={tr('حساب المدين', 'Debit account')}>
            <Select value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)}>
              <option value="">—</option>
              {(accounts.data ?? []).filter((a) => a.code && !['41'].includes(a.code)).map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}
            </Select>
          </Field>
          <Field label={tr('حساب الدائن', 'Credit account')}>
            <Select value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)}>
              <option value="">—</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}
            </Select>
          </Field>
          <Field label={tr('المبلغ', 'Amount')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
          <ErrorNote error={error} />
        </div>
      </Modal>
    </>
  );
}
