'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useApp } from '@/components/Providers';
import { Badge, Card, CardHead, DataTable, DateText, ErrorNote, Loading, Money, PageHeader, StatCard } from '@/components/ui';
import { formatDate, formatMoney, formatQty, today } from '@/lib/format';
import { useApi, useOptions } from '@/lib/hooks';

interface Name { code: string; nameAr: string; nameEn: string | null }
interface Dashboard {
  sales: { today: string; month: string };
  purchasesMonth: string;
  cash: { cashboxes: string; banks: string; total: string };
  receivables: string;
  payables: string;
  inventoryValue: string;
  lowStockProducts: number;
  comparison: { salesYesterday: string; salesPreviousMonthToDate: string; purchasesPreviousMonthToDate: string };
  salesByPayment: { cash: string; credit: string };
  topRepresentatives: { representative?: Name; total: string; invoices: number }[];
  salesTrend: { date: string; amount: string; previous: string }[];
  topCustomers: { customer?: Name; total: string }[];
  topProducts: { product?: Name; quantity: string; revenue: string }[];
}
interface Invoice {
  id: string; number: number; invoiceDate: string; kind: string; status: string; total: string;
  paymentKind: string; customer: { code: string; nameAr: string } | null;
}
interface Balance {
  warehouseId: string; productId: string; quantity: string;
  product: { code: string; nameAr: string; nameEn: string | null; reorderLevel: string };
  warehouse: { code: string };
}
interface FinAccount { id: string; code: string; kind: 'CASHBOX' | 'BANK'; nameAr: string; nameEn: string; balance: string }

/** Percentage change; null when there is nothing to compare with. */
function pct(now: string, before: string): number | null {
  const b = Number(before);
  return b > 0 ? ((Number(now) - b) / b) * 100 : null;
}

export default function DashboardPage() {
  const { tr, lang } = useApp();
  const [days, setDays] = useState(14);
  const [repId, setRepId] = useState('');
  const [branchId, setBranchId] = useState('');
  const qs = new URLSearchParams({ days: String(days) });
  if (repId) qs.set('representativeId', repId);
  if (branchId) qs.set('branchId', branchId);
  const { data, error, loading } = useApi<Dashboard>(`reports/dashboard?${qs}`);
  const reps = useOptions<{ id: string; nameAr: string; nameEn?: string | null }>('representatives?pageSize=100', (r) => ({ value: r.id, label: (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) }), [lang]);
  const branches = useOptions<{ id: string; nameAr: string; nameEn?: string | null }>('branches', (r) => ({ value: r.id, label: (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) }), [lang]);
  const invoices = useApi<{ items: Invoice[] }>('sales/invoices?pageSize=6');
  const low = useApi<{ items: Balance[] }>('inventory/balances?lowOnly=true&pageSize=6');
  const accounts = useApi<FinAccount[]>('financial-accounts');

  const name = (n?: Name | null) => (n ? (lang === 'ar' ? n.nameAr : n.nameEn || n.nameAr) : '—');
  const max = useMemo(() => Math.max(1, ...(data?.salesTrend ?? []).flatMap((d) => [Number(d.amount), Number(d.previous)])), [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={tr('لوحة التحكم', 'Dashboard')}
        sub={`${tr('نظرة سريعة على أداء الشركة', 'A quick look at company performance')} · ${formatDate(today())}`}
      >
        <Link href="/sales?new=1" className="btn">
          <Icon name="plus" size={16} /> {tr('فاتورة بيع', 'Sales invoice')}
        </Link>
        <Link href="/treasury?tab=vouchers&new=1" className="btn ghost">
          <Icon name="receipt" size={16} /> {tr('سند قبض', 'Receipt voucher')}
        </Link>
      </PageHeader>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={tr('فترة الرسم', 'Trend period')}>
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{tr(`آخر ${d} يومًا`, `Last ${d} days`)}</option>)}
        </select>
        <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label={tr('الفرع', 'Branch')}>
          <option value="">{tr('كل الفروع', 'All branches')}</option>
          {branches.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select" value={repId} onChange={(e) => setRepId(e.target.value)} aria-label={tr('المندوب', 'Representative')}>
          <option value="">{tr('كل المندوبين', 'All representatives')}</option>
          {reps.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {loading ? <span className="muted text-sm">{tr('جارٍ التحديث…', 'Updating…')}</span> : null}
      </div>

      <div className="kpi-grid">
        <StatCard label={tr('مبيعات اليوم', 'Sales today')} value={<Money value={data.sales.today} />} icon="cart" hint={tr('إجمالي فواتير اليوم', 'Invoiced today')} delta={{ pct: pct(data.sales.today, data.comparison.salesYesterday), label: tr('مقابل أمس', 'vs yesterday') }} />
        <StatCard label={tr('مبيعات الشهر', 'Sales this month')} value={<Money value={data.sales.month} />} icon="trending" hint={tr('من أول الشهر حتى اليوم', 'Month to date')} delta={{ pct: pct(data.sales.month, data.comparison.salesPreviousMonthToDate), label: tr('مقابل نفس الفترة الشهر الماضي', 'vs same days last month') }} />
        <StatCard label={tr('النقدية والبنوك', 'Cash & banks')} value={<Money value={data.cash.total} />} icon="wallet" hint={`${tr('خزائن', 'Cash')} ${formatMoney(data.cash.cashboxes)} · ${tr('بنوك', 'Banks')} ${formatMoney(data.cash.banks)}`} />
        <StatCard label={tr('مستحقات العملاء', 'Receivables')} value={<Money value={data.receivables} />} icon="users" tone="info" hint={tr('أرصدة العملاء المدينة', 'Customer balances')} />
        <StatCard label={tr('مستحقات الموردين', 'Payables')} value={<Money value={data.payables} />} icon="building" tone="warn" hint={tr('أرصدة الموردين الدائنة', 'Supplier balances')} />
        <StatCard label={tr('قيمة المخزون', 'Inventory value')} value={<Money value={data.inventoryValue} />} icon="box" hint={tr('بالتكلفة المتوسطة', 'At weighted-average cost')} />
        <StatCard label={tr('مشتريات الشهر', 'Purchases this month')} value={<Money value={data.purchasesMonth} />} icon="truck" hint={tr('فواتير الشراء', 'Purchase invoices')} delta={{ pct: pct(data.purchasesMonth, data.comparison.purchasesPreviousMonthToDate), label: tr('مقابل الشهر الماضي', 'vs last month'), invert: true }} />
        <StatCard
          label={tr('أصناف تحت حد الطلب', 'Below reorder level')}
          value={data.lowStockProducts}
          icon="alert"
          tone={data.lowStockProducts > 0 ? 'danger' : undefined}
          hint={tr('تحتاج إعادة طلب', 'Need replenishment')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }} className="dash-grid">
        <Card>
          <CardHead title={tr(`حركة المبيعات — آخر ${days} يومًا`, `Sales trend — last ${days} days`)} sub={tr('القيم بالجنيه', 'Amounts in EGP')}>
            <div className="legend"><span><i style={{ background: 'var(--primary)' }} /> {tr('المبيعات', 'Sales')}</span> <span><i style={{ background: 'var(--line, #cbd5e1)' }} /> {tr('الفترة السابقة', 'Previous period')}</span></div>
          </CardHead>
          <div className="card-body">
            <div className="chart-bars">
              {data.salesTrend.map((d, i) => {
                const h = Math.max(2, (Math.max(0, Number(d.amount)) / max) * 100);
                const ph = Math.max(0, (Math.max(0, Number(d.previous)) / max) * 100);
                const step = Math.ceil(data.salesTrend.length / 14);
                return (
                  <div className="bar-wrap" key={d.date}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: '100%' }}>
                      <div className="bar" style={{ height: `${h}%`, flex: 1 }} title={`${formatDate(d.date)} — ${formatMoney(d.amount)}`} />
                      <div className="bar" style={{ height: `${ph}%`, flex: 1, background: 'var(--line, #cbd5e1)' }} title={`${tr('الفترة السابقة', 'Previous period')} — ${formatMoney(d.previous)}`} />
                    </div>
                    {i % step === 0 ? <div className="bar-label">{d.date.slice(8, 10)}</div> : <div className="bar-label">&nbsp;</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title={tr('المراكز النقدية', 'Cash position')} sub={tr('أرصدة الخزائن والبنوك', 'Balances from the ledger')}>
            <Link href="/treasury" className="link text-sm">{tr('عرض', 'View')}</Link>
          </CardHead>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {accounts.loading ? <Loading /> : (accounts.data ?? []).length === 0 ? <div className="empty" style={{ padding: 20 }}>{tr('لا توجد خزائن', 'No cash boxes')}</div> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(accounts.data ?? []).map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
                    <div className={`kpi-icon`} style={{ width: 32, height: 32, flexBasis: 32, background: a.kind === 'BANK' ? 'var(--info-soft)' : 'var(--primary-soft)', color: a.kind === 'BANK' ? 'var(--info)' : 'var(--primary)' }}>
                      <Icon name={a.kind === 'BANK' ? 'bank' : 'coins'} size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{lang === 'ar' ? a.nameAr : a.nameEn}</div>
                      <div className="text-sm muted">{a.kind === 'BANK' ? tr('بنك', 'Bank') : tr('خزينة', 'Cash box')} · {a.code}</div>
                    </div>
                    <Money value={a.balance} bold />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 600 }}>
                  <span>{tr('الإجمالي', 'Total')}</span>
                  <Money value={data.cash.total} bold />
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }} className="dash-grid">
        <Card>
          <CardHead title={tr('أحدث فواتير البيع', 'Latest sales invoices')}>
            <Link href="/sales" className="link text-sm">{tr('الكل', 'All')}</Link>
          </CardHead>
          <DataTable<Invoice>
            compact
            rows={invoices.data?.items ?? []}
            rowKey={(r) => r.id}
            loading={invoices.loading && !invoices.data}
            columns={[
              { key: 'no', header: '#', render: (r) => <span className="mono">#{r.number}</span>, width: '70px' },
              { key: 'cust', header: tr('العميل', 'Customer'), render: (r) => r.customer?.nameAr ?? tr('نقدي', 'Cash') },
              { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.invoiceDate} /> },
              { key: 'kind', header: tr('النوع', 'Type'), render: (r) => r.kind === 'RETURN' ? <Badge tone="warn">{tr('مرتجع', 'Return')}</Badge> : <Badge tone={r.paymentKind === 'CREDIT' ? 'info' : 'ok'}>{r.paymentKind === 'CREDIT' ? tr('آجل', 'Credit') : tr('نقدي', 'Cash')}</Badge> },
              { key: 'total', header: tr('الإجمالي', 'Total'), align: 'end', render: (r) => <Money value={r.total} /> },
            ]}
          />
        </Card>

        <Card>
          <CardHead title={tr('تنبيهات المخزون', 'Stock alerts')} sub={tr('أصناف وصلت لحد الطلب', 'Products at or below reorder level')}>
            <Link href="/inventory" className="link text-sm">{tr('المخزون', 'Inventory')}</Link>
          </CardHead>
          <DataTable<Balance>
            compact
            rows={low.data?.items ?? []}
            rowKey={(r) => `${r.warehouseId}-${r.productId}`}
            loading={low.loading && !low.data}
            columns={[
              { key: 'code', header: tr('الكود', 'Code'), render: (r) => <span className="mono">{r.product.code}</span> },
              { key: 'name', header: tr('الصنف', 'Product'), render: (r) => r.product.nameAr },
              { key: 'wh', header: tr('المخزن', 'Warehouse'), render: (r) => r.warehouse.code },
              { key: 'qty', header: tr('الرصيد', 'On hand'), align: 'end', render: (r) => <span className={Number(r.quantity) <= 0 ? 'neg' : ''}>{formatQty(r.quantity)}</span> },
              { key: 'reorder', header: tr('حد الطلب', 'Reorder'), align: 'end', render: (r) => formatQty(r.product.reorderLevel) },
            ]}
            empty={<div className="empty" style={{ padding: 24 }}>{tr('كل الأصناف فوق حد الطلب', 'All products are above their reorder level')}</div>}
          />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 16 }} className="dash-grid">
        <Card>
          <CardHead title={tr('أفضل العملاء', 'Top customers')} sub={tr('حسب قيمة المبيعات', 'By sales value')} />
          <DataTable
            compact
            rows={data.topCustomers}
            rowKey={(_, i) => `c${i}`}
            columns={[
              { key: 'n', header: tr('العميل', 'Customer'), render: (r) => name(r.customer) },
              { key: 'v', header: tr('المبيعات', 'Sales'), align: 'end', render: (r) => <Money value={r.total} /> },
            ]}
            empty={<div className="empty" style={{ padding: 24 }}>{tr('لا مبيعات بعد', 'No sales yet')}</div>}
          />
        </Card>
        <Card>
          <CardHead title={tr('أفضل الأصناف', 'Top products')} sub={tr('حسب الإيراد', 'By revenue')} />
          <DataTable
            compact
            rows={data.topProducts}
            rowKey={(_, i) => `p${i}`}
            columns={[
              { key: 'n', header: tr('الصنف', 'Product'), render: (r) => name(r.product) },
              { key: 'q', header: tr('الكمية', 'Qty'), align: 'end', render: (r) => formatQty(r.quantity) },
              { key: 'v', header: tr('الإيراد', 'Revenue'), align: 'end', render: (r) => <Money value={r.revenue} /> },
            ]}
            empty={<div className="empty" style={{ padding: 24 }}>{tr('لا مبيعات بعد', 'No sales yet')}</div>}
          />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 16 }} className="dash-grid">
        <Card>
          <CardHead title={tr('أفضل المندوبين', 'Top representatives')} sub={tr('مبيعات الشهر', 'Month-to-date sales')} />
          <DataTable
            compact
            rows={data.topRepresentatives}
            rowKey={(_, i) => `r${i}`}
            columns={[
              { key: 'n', header: tr('المندوب', 'Representative'), render: (r) => name(r.representative) },
              { key: 'c', header: tr('الفواتير', 'Invoices'), align: 'end', render: (r) => r.invoices },
              { key: 'v', header: tr('المبيعات', 'Sales'), align: 'end', render: (r) => <Money value={r.total} /> },
            ]}
            empty={<div className="empty" style={{ padding: 24 }}>{tr('لا مبيعات مندوبين بعد', 'No representative sales yet')}</div>}
          />
        </Card>
        <Card>
          <CardHead title={tr('نقدي مقابل آجل', 'Cash vs credit')} sub={tr('مبيعات الشهر', 'Month-to-date sales')} />
          <div className="card-body">
            {(() => {
              const cash = Number(data.salesByPayment.cash), credit = Number(data.salesByPayment.credit), sum = cash + credit;
              const cp = sum > 0 ? (cash / sum) * 100 : 0;
              return (
                <>
                  <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--line-2, #e2e8f0)' }}>
                    <div style={{ width: `${cp}%`, background: 'var(--primary)' }} />
                    <div style={{ width: `${sum > 0 ? 100 - cp : 0}%`, background: 'var(--info, #2563eb)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    <div><div className="text-sm muted">{tr('نقدي', 'Cash')} · {cp.toFixed(0)}%</div><Money value={data.salesByPayment.cash} bold /></div>
                    <div style={{ textAlign: 'end' }}><div className="text-sm muted">{tr('آجل', 'Credit')} · {sum > 0 ? (100 - cp).toFixed(0) : 0}%</div><Money value={data.salesByPayment.credit} bold /></div>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      </div>

      <style>{`@media (max-width: 1000px){ .dash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
