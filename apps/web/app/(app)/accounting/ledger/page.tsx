'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/Providers';
import { Button, Card, DataTable, DateText, EmptyState, ErrorNote, Field, Input, Loading, Money, PageHeader, Pagination, Select, Tabs } from '@/components/ui';
import { useApi, usePaged } from '@/lib/hooks';

interface TBRow { accountId: string; code: string; nameAr: string; nameEn: string; type: string; openingBalance: string; movementDebit: string; movementCredit: string; closingDebit: string; closingCredit: string }
interface Account { id: string; code: string; nameAr: string; nameEn: string; isPostable: boolean }
interface LedgerRow { id: string; entryId: string; entryNumber: number; entryDate: string; description: string; lineDescription: string | null; debit: string; credit: string; runningBalance: string }

export default function LedgerPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'tb' | 'ledger'>('tb');
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const accounts = useApi<Account[]>('accounting/accounts');
  const postable = (accounts.data ?? []).filter((a) => a.isPostable);
  const tb = useApi<TBRow[]>(`accounting/reports/trial-balance?asOf=${asOf}`);
  const ledgerPath = useMemo(() => (accountId ? `accounting/reports/ledger/${accountId}?from=${from}&to=${to}&page=${page}&pageSize=${pageSize}` : null), [accountId, from, to, page, pageSize]);
  const ledger = usePaged<LedgerRow>(ledgerPath);

  const tbTotals = useMemo(() => {
    const rows = tb.data ?? [];
    return rows.reduce((a, r) => ({ d: a.d + Number(r.closingDebit), c: a.c + Number(r.closingCredit) }), { d: 0, c: 0 });
  }, [tb.data]);

  return (
    <>
      <PageHeader title={tr('ميزان المراجعة والأستاذ', 'Trial balance & ledger')} sub={tr('أرصدة الحسابات وحركات الأستاذ العام', 'Account balances and general ledger movements')} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'tb', label: tr('ميزان المراجعة', 'Trial balance') },
          { id: 'ledger', label: tr('الأستاذ العام', 'General ledger') },
        ]} />
      </div>

      {tab === 'tb' ? (
        <Card>
          <div className="toolbar" style={{ padding: '12px 16px 0' }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="hint">{tr('كما في تاريخ', 'As of')}</span>
              <Input type="date" dir="ltr" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 160 }} />
            </label>
            <div className="spacer" />
            {tb.data ? <span className="muted">{tr('الحسابات', 'Accounts')}: {tb.data.length}</span> : null}
          </div>
          <ErrorNote error={tb.error} />
          {tb.loading && !tb.data ? <Loading /> : null}
          {tb.data ? (
            <DataTable<TBRow>
              rows={tb.data}
              rowKey={(r) => r.accountId}
              columns={[
                { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
                { key: 'name', header: tr('الحساب', 'Account'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
                { key: 'type', header: tr('النوع', 'Type'), render: (r) => r.type },
                { key: 'open', header: tr('افتتاحي', 'Opening'), align: 'end', render: (r) => <Money value={r.openingBalance} /> },
                { key: 'md', header: tr('مدين', 'Debit'), align: 'end', render: (r) => <Money value={r.movementDebit} /> },
                { key: 'mc', header: tr('دائن', 'Credit'), align: 'end', render: (r) => <Money value={r.movementCredit} /> },
                { key: 'cd', header: tr('مدين ختامي', 'Closing Dr'), align: 'end', render: (r) => <Money value={r.closingDebit} bold /> },
                { key: 'cc', header: tr('دائن ختامي', 'Closing Cr'), align: 'end', render: (r) => <Money value={r.closingCredit} bold /> },
              ]}
              empty={<EmptyState title={tr('لا توجد بيانات', 'No data')} />}
              footer={
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>{tr('الإجمالي', 'Total')}</td>
                  <td style={{ textAlign: 'end', fontWeight: 700 }}><Money value={tbTotals.d.toFixed(2)} bold /></td>
                  <td style={{ textAlign: 'end', fontWeight: 700 }}><Money value={tbTotals.c.toFixed(2)} bold /></td>
                  <td />
                  <td />
                </tr>
              }
            />
          ) : null}
        </Card>
      ) : (
        <Card>
          <div className="toolbar" style={{ padding: '12px 16px 0' }}>
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 260 }}>
              <option value="">{tr('اختر حسابًا…', 'Choose an account…')}</option>
              {postable.map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
          </div>
          <ErrorNote error={ledger.error} />
          {ledger.loading && !ledger.data ? <Loading /> : null}
          {accountId && ledger.data ? (
            <>
              <DataTable<LedgerRow>
                rows={ledger.data.items}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.entryDate} />, width: '105px' },
                  { key: 'no', header: tr('القيد', 'Entry'), render: (r) => <span className="mono">#{r.entryNumber}</span>, width: '80px' },
                  { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.lineDescription || r.description },
                  { key: 'debit', header: tr('مدين', 'Debit'), align: 'end', render: (r) => <Money value={r.debit} /> },
                  { key: 'credit', header: tr('دائن', 'Credit'), align: 'end', render: (r) => <Money value={r.credit} /> },
                  { key: 'bal', header: tr('الرصيد', 'Balance'), align: 'end', render: (r) => <Money value={r.runningBalance} bold /> },
                ]}
                empty={<EmptyState title={tr('لا توجد حركات', 'No movements')} />}
              />
              <Pagination page={ledger.data.page} pageSize={ledger.data.pageSize} total={ledger.data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </>
          ) : null}
        </Card>
      )}
    </>
  );
}
