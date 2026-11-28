'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/Providers';
import { Badge, Card, CardHead, DataTable, ErrorNote, Input, Loading, Money, PageHeader, StatCard } from '@/components/ui';
import { formatMoney, today } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Row {
  id: string; code: string; nameAr: string; nameEn: string | null; phone: string | null;
  route: { code: string; nameAr: string; nameEn: string } | null; plateNumber: string | null;
  visits: { done: number; planned: number; byOutcome: Record<string, number> };
  sales: { cash: string; credit: string; returns: string; net: string; invoices: number };
  collections: { amount: string; count: number };
  custodyBalance: string;
  dayClosed: boolean;
  closing: { cashDifference: string; stockDifferenceValue: string } | null;
  lastActivityAt: string | null;
}
interface Monitor {
  date: string;
  totals: { representatives: number; active: number; closed: number; visits: number; salesNet: string; collections: string; custodyBalance: string };
  representatives: Row[];
}

export default function RepMonitorPage() {
  const { tr, lang } = useApp();
  const [date, setDate] = useState(today());
  const { data, error, loading, reload } = useApi<Monitor>(`representatives/monitor?date=${date}`);

  // Live view of today: refresh every minute while the page is open.
  useEffect(() => {
    if (date !== today()) return;
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [date, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;
  const t = data.totals;
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <>
      <PageHeader title={tr('متابعة المناديب', 'Representative monitoring')} sub={tr('الزيارات والمبيعات والتحصيل والعهدة لكل مندوب في اليوم', 'Visits, sales, collections and custody per representative for the day')}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} aria-label={tr('اليوم', 'Day')} />
        <button className="btn ghost" onClick={reload}>{tr('تحديث', 'Refresh')}</button>
      </PageHeader>

      <div className="kpi-grid">
        <StatCard label={tr('مناديب نشطون', 'Active today')} value={`${t.active} / ${t.representatives}`} icon="users" hint={tr('لديهم حركة في هذا اليوم', 'With activity on this day')} />
        <StatCard label={tr('إجمالي الزيارات', 'Visits')} value={t.visits} icon="route" />
        <StatCard label={tr('صافي المبيعات', 'Net sales')} value={<Money value={t.salesNet} />} icon="cart" />
        <StatCard label={tr('التحصيلات', 'Collections')} value={<Money value={t.collections} />} icon="receipt" />
        <StatCard label={tr('عهدة بحوزة المناديب', 'Cash in custody')} value={<Money value={t.custodyBalance} />} icon="wallet" tone={Number(t.custodyBalance) > 0 ? 'warn' : undefined} hint={tr('أرصدة العهد الحالية', 'Current custody balances')} />
        <StatCard label={tr('أيام مقفلة', 'Days closed')} value={`${t.closed} / ${t.representatives}`} icon="check" tone={t.closed < t.representatives ? 'info' : undefined} />
      </div>

      <Card>
        <CardHead title={tr('المناديب', 'Representatives')} sub={data.date} />
        <DataTable<Row>
          rows={data.representatives}
          rowKey={(r) => r.id}
          loading={loading}
          columns={[
            { key: 'n', header: tr('المندوب', 'Representative'), render: (r) => (
              <div><div style={{ fontWeight: 500 }}>{lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr}</div><div className="text-sm muted">{r.code}{r.plateNumber ? ` · ${r.plateNumber}` : ''}</div></div>
            ) },
            { key: 'route', header: tr('خط السير', 'Route'), render: (r) => (r.route ? (lang === 'ar' ? r.route.nameAr : r.route.nameEn) : '—') },
            { key: 'v', header: tr('الزيارات', 'Visits'), align: 'end', render: (r) => (
              <span title={Object.entries(r.visits.byOutcome).map(([k, v]) => `${k}: ${v}`).join(' · ')}>{r.visits.done}{r.visits.planned ? ` / ${r.visits.planned}` : ''}</span>
            ) },
            { key: 'inv', header: tr('الفواتير', 'Invoices'), align: 'end', render: (r) => r.sales.invoices },
            { key: 's', header: tr('صافي المبيعات', 'Net sales'), align: 'end', render: (r) => <span title={`${tr('نقدي', 'Cash')} ${formatMoney(r.sales.cash)} · ${tr('آجل', 'Credit')} ${formatMoney(r.sales.credit)} · ${tr('مرتجع', 'Returns')} ${formatMoney(r.sales.returns)}`}><Money value={r.sales.net} /></span> },
            { key: 'c', header: tr('التحصيل', 'Collected'), align: 'end', render: (r) => <Money value={r.collections.amount} /> },
            { key: 'cu', header: tr('العهدة', 'Custody'), align: 'end', render: (r) => <Money value={r.custodyBalance} /> },
            { key: 'la', header: tr('آخر نشاط', 'Last activity'), render: (r) => time(r.lastActivityAt) },
            { key: 'st', header: tr('الحالة', 'Status'), render: (r) => r.dayClosed ? (
              <Badge tone={Number(r.closing?.cashDifference) !== 0 || Number(r.closing?.stockDifferenceValue) !== 0 ? 'warn' : 'ok'}>
                {tr('مقفل', 'Closed')}{r.closing && Number(r.closing.cashDifference) !== 0 ? ` · ${formatMoney(r.closing.cashDifference)}` : ''}
              </Badge>
            ) : r.lastActivityAt ? <Badge tone="info">{tr('يعمل', 'Working')}</Badge> : <Badge>{tr('لا نشاط', 'No activity')}</Badge> },
          ]}
          empty={<div className="empty" style={{ padding: 24 }}>{tr('لا يوجد مناديب نشطون', 'No active representatives')}</div>}
        />
      </Card>
    </>
  );
}
