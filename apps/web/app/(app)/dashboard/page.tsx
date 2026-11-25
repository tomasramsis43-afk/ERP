'use client';

import React from 'react';
import { Column, DataTable } from '@/components/DataTable';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';
import { useApi } from '@/lib/useApi';

interface Name { code: string; nameAr: string; nameEn: string | null }
interface Dashboard {
  sales: { today: string; month: string };
  purchasesMonth: string;
  cash: { cashboxes: string; banks: string; total: string };
  receivables: string;
  payables: string;
  inventoryValue: string;
  lowStockProducts: number;
  salesTrend: { date: string; amount: string }[];
  topCustomers: { customer?: Name; total: string }[];
  topProducts: { product?: Name; quantity: string; revenue: string }[];
}

export default function DashboardPage() {
  const { t, lang } = useApp();
  const { data, error, loading } = useApi<Dashboard>('reports/dashboard');
  const name = (n?: Name) => (n ? (lang === 'ar' ? n.nameAr : n.nameEn || n.nameAr) : '');
  const m = (v: string) => formatMoney(v, lang);

  if (error) return <p className="error">{t('error')}: {error}</p>;
  if (loading || !data) return <p className="muted">{t('loading')}</p>;

  const tiles: [string, string][] = [
    [t('salesToday'), m(data.sales.today)], [t('salesMonth'), m(data.sales.month)], [t('purchasesMonth'), m(data.purchasesMonth)],
    [t('cashAndBanks'), m(data.cash.total)], [t('receivables'), m(data.receivables)], [t('payables'), m(data.payables)],
    [t('inventoryValue'), m(data.inventoryValue)], [t('lowStock'), String(data.lowStockProducts)],
  ];
  const max = Math.max(1, ...data.salesTrend.map((d) => Number(d.amount)));
  const custCols: Column<Dashboard['topCustomers'][number]>[] = [
    { header: t('customer'), render: (r) => name(r.customer) },
    { header: t('total'), numeric: true, render: (r) => m(r.total) },
  ];
  const prodCols: Column<Dashboard['topProducts'][number]>[] = [
    { header: t('name'), render: (r) => name(r.product) },
    { header: t('amount'), numeric: true, render: (r) => m(r.revenue) },
  ];

  return (
    <>
      <h1>{t('dashboard')}</h1>
      <div className="grid">
        {tiles.map(([label, value]) => (
          <div className="card" key={label}><div className="label">{label}</div><div className="value">{value}</div></div>
        ))}
      </div>
      <h2>{t('salesTrend')}</h2>
      <div className="card">
        <div className="bars" role="img" aria-label={t('salesTrend')}>
          {data.salesTrend.map((d) => <div key={d.date} title={`${d.date}: ${m(d.amount)}`} style={{ height: `${Math.max(2, (Math.max(0, Number(d.amount)) / max) * 100)}%` }} />)}
        </div>
      </div>
      <h2>{t('topCustomers')}</h2>
      <DataTable columns={custCols} rows={data.topCustomers} rowKey={(_, i) => `c${i}`} />
      <h2>{t('topProducts')}</h2>
      <DataTable columns={prodCols} rows={data.topProducts} rowKey={(_, i) => `p${i}`} />
    </>
  );
}
