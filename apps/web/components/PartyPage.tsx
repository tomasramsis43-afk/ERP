'use client';

import React, { useMemo, useState } from 'react';
import { useApp } from './Providers';
import { ResourcePage, FieldDef } from './ResourcePage';
import { Badge, Card, DataTable, DateText, DetailGrid, ErrorNote, Loading, Money, Select, Tabs, Button, SummaryStrip } from './ui';
import { useApi, useOptions, useUrlParam } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
import { Icon } from './Icon';
import { VisitsTab } from './VisitsTab';

type Kind = 'customers' | 'suppliers';

interface Party {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  creditLimit?: string;
  balance?: string;
  paymentTermsDays?: number;
  regionId?: string | null;
  routeId?: string | null;
  representativeId?: string | null;
  region?: { id: string; nameAr: string; nameEn: string } | null;
  route?: { id: string; nameAr: string; nameEn: string } | null;
  representative?: { id: string; nameAr: string } | null;
  isActive: boolean;
}

interface StatementRow {
  entryId: string;
  entryNumber: number;
  entryDate: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
}
interface Statement {
  openingBalance: string;
  rows: StatementRow[];
  closingBalance: string;
}
interface Aging {
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
  unappliedCredit: string;
}

/** Customers and suppliers share the same screen; only the fields and endpoints differ. */
export function PartyPage({ kind }: { kind: Kind }) {
  const { tr, lang } = useApp();
  const initialDetailId = useUrlParam('id');
  const isCustomer = kind === 'customers';
  const title = isCustomer ? tr('العملاء', 'Customers') : tr('الموردون', 'Suppliers');

  const regions = useOptions<{ id: string; nameAr: string; nameEn: string }>('geo-areas?level=REGION', (r) => ({
    value: r.id,
    label: lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr,
  }));
  const routes = useOptions<{ id: string; nameAr: string; nameEn: string }>('routes', (r) => ({
    value: r.id,
    label: lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr,
  }));
  const reps = useOptions<{ id: string; nameAr: string }>('representatives?pageSize=100', (r) => ({ value: r.id, label: r.nameAr }));

  const fields: FieldDef[] = useMemo(() => {
    const base: FieldDef[] = [
      { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-3', placeholder: 'C-001' },
      { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-5' },
      { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), col: 'col-4' },
      { name: 'phone', label: tr('الهاتف', 'Phone'), type: 'tel', col: 'col-4' },
      { name: 'address', label: tr('العنوان', 'Address'), col: 'col-8' },
      {
        name: 'paymentTermsDays',
        label: tr('مهلة السداد (يوم)', 'Payment terms (days)'),
        type: 'number',
        col: 'col-4',
        min: '0',
        transform: (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      },
    ];
    if (isCustomer) {
      base.splice(4, 0, { name: 'creditLimit', label: tr('حد الائتمان', 'Credit limit'), type: 'money', col: 'col-4' });
      base.push(
        { name: 'regionId', label: tr('المنطقة', 'Region'), type: 'select', options: regions.options, col: 'col-4' },
        { name: 'routeId', label: tr('خط السير', 'Route'), type: 'select', options: routes.options, col: 'col-4' },
        { name: 'representativeId', label: tr('المندوب', 'Representative'), type: 'select', options: reps.options, col: 'col-4' },
      );
    }
    base.push({ name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', defaultValue: true, hideInCreate: true, col: 'col-4' });
    return base;
  }, [isCustomer, regions.options, routes.options, reps.options, tr]);

  return (
    <ResourcePage<Party>
      title={title}
      sub={
        isCustomer
          ? tr('أرصدة العملاء وحدود الائتمان وكشوف الحساب', 'Customer balances, credit limits and statements')
          : tr('أرصدة الموردين وكشوف الحساب', 'Supplier balances and statements')
      }
      endpoint={kind}
      searchPlaceholder={tr('ابحث بالاسم أو الكود أو الهاتف…', 'Search name, code or phone…')}
      columns={[
        { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
        {
          key: 'name',
          header: tr('الاسم', 'Name'),
          render: (r) => (
            <div>
              <div className="fw-600">{lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr}</div>
              {r.phone ? <div className="muted" style={{ fontSize: 12 }} dir="ltr">{r.phone}</div> : null}
            </div>
          ),
        },
        ...(isCustomer
          ? [
              {
                key: 'rep',
                header: tr('المندوب / الخط', 'Rep / route'),
                render: (r: Party) => (
                  <span className="muted">
                    {r.representative?.nameAr ?? '—'} {r.route ? `· ${lang === 'ar' ? r.route.nameAr : r.route.nameEn}` : ''}
                  </span>
                ),
              },
              {
                key: 'limit',
                header: tr('حد الائتمان', 'Credit limit'),
                align: 'end' as const,
                render: (r: Party) => <Money value={r.creditLimit} />,
              },
            ]
          : []),
        {
          key: 'balance',
          header: tr('الرصيد', 'Balance'),
          align: 'end',
          render: (r) => (
            <span className={Number(r.balance ?? 0) > 0 ? 'fw-600' : ''}>
              <Money value={r.balance ?? '0.00'} bold />
            </span>
          ),
        },
        {
          key: 'active',
          header: tr('الحالة', 'Status'),
          align: 'center',
          render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>),
        },
      ]}
      fields={fields}
      createLabel={isCustomer ? tr('عميل جديد', 'New customer') : tr('مورد جديد', 'New supplier')}
      detailTitle={(r) => `${r.code} · ${lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr}`}
      initialDetailId={initialDetailId}
      renderDetail={(row) => <PartyDetail kind={kind} party={row} />}
      toEditValues={(r) => ({
        ...r,
        regionId: r.regionId ?? '',
        routeId: r.routeId ?? '',
        representativeId: r.representativeId ?? '',
      })}
    />
  );
}

function PartyDetail({ kind, party }: { kind: Kind; party: Party }) {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'info' | 'statement' | 'aging' | 'visits'>('info');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [from, to]);
  const statement = useApi<Statement>(tab === 'statement' ? `${kind}/${party.id}/statement${qs ? `?${qs}` : ''}` : null);
  const aging = useApi<Aging>(tab === 'aging' ? `${kind}/${party.id}/aging` : null);
  const full = useApi<Party>(`${kind}/${party.id}`);
  const p = full.data ?? party;

  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'info', label: tr('البيانات', 'Details') },
          { id: 'statement', label: tr('كشف الحساب', 'Statement') },
          { id: 'aging', label: tr('أعمار الديون', 'Aging') },
          ...(kind === 'customers' ? [{ id: 'visits' as const, label: tr('الزيارات', 'Visits') }] : []),
        ]}
      />

      {tab === 'info' ? (
        <div className="mt-16">
          <SummaryStrip
            items={[
              { label: tr('الرصيد الحالي', 'Current balance'), value: <Money value={p.balance ?? '0.00'} bold /> },
              ...(kind === 'customers' ? [{ label: tr('حد الائتمان', 'Credit limit'), value: <Money value={p.creditLimit ?? '0.00'} /> }] : []),
              { label: tr('مهلة السداد', 'Payment terms'), value: `${p.paymentTermsDays ?? 0} ${tr('يوم', 'days')}` },
              { label: tr('الحالة', 'Status'), value: p.isActive ? tr('نشط', 'Active') : tr('موقوف', 'Inactive') },
            ]}
          />
          <div className="mt-16">
            <DetailGrid
              items={[
                { label: tr('الكود', 'Code'), value: <span className="mono">{p.code}</span> },
                { label: tr('الاسم بالعربية', 'Arabic name'), value: p.nameAr },
                { label: tr('الاسم بالإنجليزية', 'English name'), value: p.nameEn || '—' },
                { label: tr('الهاتف', 'Phone'), value: p.phone ? <span dir="ltr" className="mono">{p.phone}</span> : '—' },
                { label: tr('العنوان', 'Address'), value: p.address || '—' },
                ...(kind === 'customers'
                  ? [
                      { label: tr('المنطقة', 'Region'), value: p.region ? (lang === 'ar' ? p.region.nameAr : p.region.nameEn) : '—' },
                      { label: tr('خط السير', 'Route'), value: p.route ? (lang === 'ar' ? p.route.nameAr : p.route.nameEn) : '—' },
                      { label: tr('المندوب', 'Representative'), value: p.representative?.nameAr ?? '—' },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      ) : null}

      {tab === 'statement' ? (
        <div className="mt-16">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="hint">{tr('من تاريخ', 'From')}</span>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="hint">{tr('إلى تاريخ', 'To')}</span>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
            </label>
            <div className="spacer" />
            {statement.data ? (
              <span className="muted">
                {tr('الرصيد الافتتاحي', 'Opening')}: <Money value={statement.data.openingBalance} /> · {tr('الختامي', 'Closing')}:{' '}
                <Money value={statement.data.closingBalance} bold />
              </span>
            ) : null}
          </div>
          <ErrorNote error={statement.error} />
          {statement.loading && !statement.data ? <Loading /> : null}
          {statement.data ? (
            <Card>
              <DataTable<StatementRow>
                columns={[
                  { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.entryDate} />, width: '110px' },
                  { key: 'no', header: tr('القيد', 'Entry'), render: (r) => <span className="mono">#{r.entryNumber}</span>, width: '80px' },
                  { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.description },
                  { key: 'debit', header: tr('مدين', 'Debit'), align: 'end', render: (r) => <Money value={r.debit} /> },
                  { key: 'credit', header: tr('دائن', 'Credit'), align: 'end', render: (r) => <Money value={r.credit} /> },
                  { key: 'balance', header: tr('الرصيد', 'Balance'), align: 'end', render: (r) => <Money value={r.balance} bold /> },
                ]}
                rows={statement.data.rows}
                rowKey={(r) => `${r.entryId}-${r.entryNumber}-${r.balance}`}
                empty={<div className="empty">{tr('لا توجد حركات في هذه الفترة', 'No movements in this period')}</div>}
              />
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'aging' ? (
        <div className="mt-16">
          <ErrorNote error={aging.error} />
          {aging.loading && !aging.data ? <Loading /> : null}
          {aging.data ? (
            <>
              <SummaryStrip
                items={[
                  { label: tr('غير مستحق', 'Current'), value: <Money value={aging.data.current} /> },
                  { label: tr('1–30 يوم', '1–30 days'), value: <Money value={aging.data.days1to30} /> },
                  { label: tr('31–60 يوم', '31–60 days'), value: <Money value={aging.data.days31to60} /> },
                  { label: tr('61–90 يوم', '61–90 days'), value: <Money value={aging.data.days61to90} /> },
                  { label: tr('أكثر من 90', 'Over 90'), value: <Money value={aging.data.over90} /> },
                  { label: tr('الإجمالي', 'Total'), value: <Money value={aging.data.total} bold /> },
                ]}
              />
              {Number(aging.data.unappliedCredit) > 0 ? (
                <div className="mt-16">
                  <Badge tone="info">
                    {tr('دفعات مقدمة غير مخصصة', 'Unapplied credit')}: {formatMoney(aging.data.unappliedCredit)}
                  </Badge>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'visits' && kind === 'customers' ? <VisitsTab customerId={party.id} /> : null}
    </div>
  );
}
