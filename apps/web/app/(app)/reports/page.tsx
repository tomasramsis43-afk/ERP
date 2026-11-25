'use client';

import React, { useState } from 'react';
import { Column, DataTable } from '@/components/DataTable';
import { useApp } from '@/components/Providers';
import { formatMoney, monthStart, queryString, today } from '@/lib/format';
import type { Key } from '@/lib/i18n';
import { useApi } from '@/lib/useApi';

type ReportId = 'income-statement' | 'balance-sheet' | 'cash-flow' | 'trial-balance' | 'aging-customers' | 'aging-suppliers';
const REPORTS: [ReportId, Key][] = [
  ['income-statement', 'incomeStatement'], ['balance-sheet', 'balanceSheet'], ['cash-flow', 'cashFlow'],
  ['trial-balance', 'trialBalance'], ['aging-customers', 'agingCustomers'], ['aging-suppliers', 'agingSuppliers'],
];
const needsRange = (r: ReportId) => r === 'income-statement' || r === 'cash-flow';

function apiPath(r: ReportId, from: string, to: string, asOf: string): string {
  switch (r) {
    case 'income-statement': return `reports/income-statement${queryString({ from, to })}`;
    case 'cash-flow': return `reports/cash-flow${queryString({ from, to })}`;
    case 'balance-sheet': return `reports/balance-sheet${queryString({ asOf })}`;
    case 'trial-balance': return `accounting/reports/trial-balance${queryString({ asOf })}`;
    case 'aging-customers': return `reports/aging/customers${queryString({ asOf })}`;
    case 'aging-suppliers': return `reports/aging/suppliers${queryString({ asOf })}`;
  }
}

interface Row { code?: string; nameAr?: string; nameEn?: string | null; amount?: string; [k: string]: unknown }

export default function ReportsPage() {
  const { t, lang } = useApp();
  const [report, setReport] = useState<ReportId>('income-statement');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [submitted, setSubmitted] = useState<string | null>(null);
  const { data, error, loading } = useApi<Record<string, unknown>>(submitted);
  const m = (v: unknown) => formatMoney(v as string, lang);
  const label = (r: Row) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) ?? '';

  const exportUrl = (format: 'xlsx' | 'pdf') =>
    `/api/proxy/reports/export/${report}${queryString({ format, lang, ...(needsRange(report) ? { from, to } : { asOf }) })}`;

  function show() {
    setSubmitted(apiPath(report, from, to, asOf));
  }

  return (
    <>
      <h1>{t('reports')}</h1>
      <div className="toolbar">
        <select value={report} onChange={(e) => { setReport(e.target.value as ReportId); setSubmitted(null); }}>
          {REPORTS.map(([id, key]) => <option key={id} value={id}>{t(key)}</option>)}
        </select>
        {needsRange(report) ? (
          <>
            <label>{t('from')} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{t('to')} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        ) : (
          <label>{t('asOf')} <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        )}
        <button className="btn" onClick={show}>{t('run')}</button>
        <a className="btn ghost" href={exportUrl('xlsx')}>{t('exportExcel')}</a>
        <a className="btn ghost" href={exportUrl('pdf')}>{t('exportPdf')}</a>
      </div>
      {error ? <p className="error">{t('error')}: {error}</p> : null}
      {loading ? <p className="muted">{t('loading')}</p> : null}
      {data ? <ReportBody report={report} data={data} m={m} label={label} /> : null}
    </>
  );
}

function ReportBody({ report, data, m, label }: { report: ReportId; data: Record<string, unknown>; m: (v: unknown) => string; label: (r: Row) => string }) {
  const { t } = useApp();
  const stmt = (rows: Row[]): Column<Row>[] => [
    { header: t('code'), render: (r) => r.code ?? '' },
    { header: t('name'), render: label },
    { header: t('amount'), numeric: true, render: (r) => m(r.amount) },
  ];
  const section = (title: string, rows: Row[], total: unknown) => (
    <>
      <h2>{title}</h2>
      <DataTable columns={stmt(rows)} rows={[...rows, { code: '', nameAr: t('total'), nameEn: t('total'), amount: String(total) }]} rowKey={(r, i) => `${r.code}-${i}`} boldRow={(r) => r.code === ''} />
    </>
  );

  if (report === 'income-statement') {
    return (
      <>
        {section(t('revenue'), data.revenue as Row[], data.totalRevenue)}
        {section('COGS', data.costOfGoodsSold as Row[], data.totalCostOfGoodsSold)}
        <h2>{t('grossProfit')}: {m(data.grossProfit)}</h2>
        {section('OPEX', data.operatingExpenses as Row[], data.totalOperatingExpenses)}
        <h2>{t('netProfit')}: {m(data.netProfit)}</h2>
      </>
    );
  }
  if (report === 'balance-sheet') {
    return (
      <>
        <p className={data.balanced ? 'ok' : 'error'}>{data.balanced ? t('balanced') : t('notBalanced')}</p>
        {section('Assets', data.assets as Row[], data.totalAssets)}
        {section('Liabilities', data.liabilities as Row[], data.totalLiabilities)}
        {section('Equity', data.equity as Row[], data.totalEquity)}
      </>
    );
  }
  if (report === 'cash-flow') {
    const lines = data.lines as { source: string; inflow: string; outflow: string; net: string }[];
    const cols: Column<(typeof lines)[number]>[] = [
      { header: t('source'), render: (r) => r.source },
      { header: t('inflow'), numeric: true, render: (r) => m(r.inflow) },
      { header: t('outflow'), numeric: true, render: (r) => m(r.outflow) },
      { header: t('net'), numeric: true, render: (r) => m(r.net) },
    ];
    return (
      <>
        <p>{t('openingCash')}: <b>{m(data.openingCash)}</b> — {t('closingCash')}: <b>{m(data.closingCash)}</b></p>
        <DataTable columns={cols} rows={lines} rowKey={(r) => r.source} />
      </>
    );
  }
  if (report === 'trial-balance') {
    const rows = data.rows as { code: string; nameAr: string; nameEn: string | null; closingDebit: string; closingCredit: string }[];
    const cols: Column<(typeof rows)[number]>[] = [
      { header: t('code'), render: (r) => r.code },
      { header: t('account'), render: label },
      { header: 'Dr', numeric: true, render: (r) => m(r.closingDebit) },
      { header: 'Cr', numeric: true, render: (r) => m(r.closingCredit) },
    ];
    return <DataTable columns={cols} rows={rows} rowKey={(r) => r.code} />;
  }
  const rows = data.rows as (Row & { current: string; days1to30: string; days31to60: string; days61to90: string; over90: string; total: string })[];
  const cols: Column<(typeof rows)[number]>[] = [
    { header: t('code'), render: (r) => r.code ?? '' },
    { header: t('name'), render: label },
    { header: t('current'), numeric: true, render: (r) => m(r.current) },
    { header: '1-30', numeric: true, render: (r) => m(r.days1to30) },
    { header: '31-60', numeric: true, render: (r) => m(r.days31to60) },
    { header: '61-90', numeric: true, render: (r) => m(r.days61to90) },
    { header: t('over90'), numeric: true, render: (r) => m(r.over90) },
    { header: t('total'), numeric: true, render: (r) => m(r.total) },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.code)} />;
}
