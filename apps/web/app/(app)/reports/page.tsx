'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/Providers';
import { Badge, Button, Card, CardHead, DataTable, DateText, EmptyState, ErrorNote, Field, Input, Loading, Money, PageHeader, Qty, Select, SummaryStrip, Tabs } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { download } from '@/lib/api';
import { queryString } from '@/lib/format';

interface Row { code: string; nameAr: string; nameEn: string; amount: string }
interface Income {
  from: string; to: string; revenue: Row[]; totalRevenue: string; costOfGoodsSold: Row[]; totalCostOfGoodsSold: string;
  grossProfit: string; operatingExpenses: Row[]; totalOperatingExpenses: string; netProfit: string;
}
interface Balance {
  asOf: string; assets: Row[]; totalAssets: string; liabilities: Row[]; totalLiabilities: string;
  equity: Row[]; currentEarnings: string; totalEquity: string; totalLiabilitiesAndEquity: string; balanced: boolean;
}
interface CashFlow { openingCash: string; lines: { source: string; inflow: string; outflow: string; net: string }[]; totalInflow: string; totalOutflow: string; netChange: string; closingCash: string }
interface AgingRow { id: string; code: string; nameAr: string; nameEn: string; current: string; days1to30: string; days31to60: string; days61to90: string; over90: string; total: string; unappliedCredit: string }
interface AgingReport { type: string; asOf: string; rows: AgingRow[]; totals: { current: string; days1to30: string; days31to60: string; days61to90: string; over90: string; total: string; unappliedCredit: string } }
interface ProfitRow { key: string; code: string; nameAr: string; nameEn: string | null; quantity: string; revenue: string; cost: string; profit: string; marginPercent: string; invoices: number }
interface ProfitReport { from: string; to: string; dimension: string; rows: ProfitRow[]; totals: { revenue: string; cost: string; profit: string; marginPercent: string } }

const REPORT_NAMES = [
  { value: 'trial-balance', label: ['ميزان المراجعة', 'Trial balance'] },
  { value: 'income-statement', label: ['قائمة الدخل', 'Income statement'] },
  { value: 'balance-sheet', label: ['الميزانية', 'Balance sheet'] },
  { value: 'cash-flow', label: ['التدفقات النقدية', 'Cash flow'] },
  { value: 'aging-customers', label: ['أعمار ديون العملاء', 'Customer aging'] },
  { value: 'aging-suppliers', label: ['أعمار ديون الموردين', 'Supplier aging'] },
];

export default function ReportsPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'income' | 'balance' | 'cashflow' | 'agingc' | 'agings' | 'profit' | 'export'>('income');
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [dimension, setDimension] = useState<'product' | 'customer' | 'area'>('product');
  const [exportName, setExportName] = useState('income-statement');
  const [exportFmt, setExportFmt] = useState<'xlsx' | 'pdf'>('xlsx');

  const income = useApi<Income>(tab === 'income' ? `reports/income-statement?from=${from}&to=${to}` : null);
  const balance = useApi<Balance>(tab === 'balance' ? `reports/balance-sheet?asOf=${asOf}` : null);
  const cashflow = useApi<CashFlow>(tab === 'cashflow' ? `reports/cash-flow?from=${from}&to=${to}` : null);
  const agingC = useApi<AgingReport>(tab === 'agingc' ? `reports/aging/customers?asOf=${asOf}` : null);
  const agingS = useApi<AgingReport>(tab === 'agings' ? `reports/aging/suppliers?asOf=${asOf}` : null);
  const profit = useApi<ProfitReport>(tab === 'profit' ? `reports/profitability?dimension=${dimension}&from=${from}&to=${to}` : null);

  const exportUrl = (name: string) => `reports/export/${name}?format=${exportFmt}&lang=${lang === 'ar' ? 'ar' : 'en'}&${name.includes('balance') || name.includes('aging') ? `asOf=${asOf}` : `from=${from}&to=${to}`}`;

  const nameOf = (r: Row) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr);

  const StatementTable = ({ title, rows, total, totalLabel }: { title: string; rows: Row[]; total: string; totalLabel: string }) => (
    <Card>
      <CardHead title={title} />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.code}
        columns={[
          { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code}</span> },
          { key: 'name', header: tr('الحساب', 'Account'), render: (r) => nameOf(r) },
          { key: 'amt', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} /> },
        ]}
        empty={<EmptyState title={tr('لا توجد بيانات', 'No data')} />}
        footer={
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>{totalLabel}</td>
            <td style={{ textAlign: 'end', fontWeight: 700 }}><Money value={total} bold /></td>
          </tr>
        }
      />
    </Card>
  );

  return (
    <>
      <PageHeader title={tr('التقارير', 'Reports')} sub={tr('القوائم المالية وأعمار الديون والربحية', 'Financial statements, aging and profitability')} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'income', label: tr('قائمة الدخل', 'Income statement') },
          { id: 'balance', label: tr('الميزانية', 'Balance sheet') },
          { id: 'cashflow', label: tr('التدفقات', 'Cash flow') },
          { id: 'agingc', label: tr('أعمار العملاء', 'Customer aging') },
          { id: 'agings', label: tr('أعمار الموردين', 'Supplier aging') },
          { id: 'profit', label: tr('الربحية', 'Profitability') },
          { id: 'export', label: tr('تصدير', 'Export') },
        ]} />
      </div>

      {(tab === 'income' || tab === 'cashflow') ? (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
        </div>
      ) : null}
      {(tab === 'balance' || tab === 'agingc' || tab === 'agings') ? (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} dir="ltr" />
        </div>
      ) : null}
      {tab === 'profit' ? (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <Select value={dimension} onChange={(e) => setDimension(e.target.value as 'product' | 'customer' | 'area')} style={{ width: 'auto', minWidth: 150 }}>
            <option value="product">{tr('حسب الصنف', 'By product')}</option>
            <option value="customer">{tr('حسب العميل', 'By customer')}</option>
            <option value="area">{tr('حسب المنطقة', 'By area')}</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
        </div>
      ) : null}

      {tab === 'income' ? (
        income.loading && !income.data ? <Loading /> : income.error ? <ErrorNote error={income.error} /> : income.data ? (
          <>
            <StatementTable title={tr('الإيرادات', 'Revenue')} rows={income.data.revenue} total={income.data.totalRevenue} totalLabel={tr('إجمالي الإيرادات', 'Total revenue')} />
            <div className="mt-16" />
            <StatementTable title={tr('تكلفة البضاعة المباعة', 'Cost of goods sold')} rows={income.data.costOfGoodsSold} total={income.data.totalCostOfGoodsSold} totalLabel={tr('إجمالي التكلفة', 'Total COGS')} />
            <Card className="mt-16">
              <div className="summary-strip">
                <div className="summary-cell"><div className="label">{tr('إجمالي الربح', 'Gross profit')}</div><div className="value"><Money value={income.data.grossProfit} bold /></div></div>
                <div className="summary-cell"><div className="label">{tr('مصاريف تشغيلية', 'Operating expenses')}</div><div className="value"><Money value={income.data.totalOperatingExpenses} /></div></div>
                <div className="summary-cell"><div className="label">{tr('صافي الربح', 'Net profit')}</div><div className="value"><Money value={income.data.netProfit} bold /></div></div>
              </div>
            </Card>
            <div className="mt-16" />
            <StatementTable title={tr('المصاريف التشغيلية', 'Operating expenses')} rows={income.data.operatingExpenses} total={income.data.totalOperatingExpenses} totalLabel={tr('إجمالي المصاريف', 'Total expenses')} />
          </>
        ) : null
      ) : null}

      {tab === 'balance' ? (
        balance.loading && !balance.data ? <Loading /> : balance.error ? <ErrorNote error={balance.error} /> : balance.data ? (
          <>
            <StatementTable title={tr('الأصول', 'Assets')} rows={balance.data.assets} total={balance.data.totalAssets} totalLabel={tr('إجمالي الأصول', 'Total assets')} />
            <div className="mt-16" />
            <StatementTable title={tr('الالتزامات', 'Liabilities')} rows={balance.data.liabilities} total={balance.data.totalLiabilities} totalLabel={tr('إجمالي الالتزامات', 'Total liabilities')} />
            <div className="mt-16" />
            <StatementTable title={tr('حقوق الملكية', 'Equity')} rows={balance.data.equity} total={balance.data.totalEquity} totalLabel={tr('إجمالي حقوق الملكية', 'Total equity')} />
            <Card className="mt-16">
              <div className="summary-strip">
                <div className="summary-cell"><div className="label">{tr('أرباح current', 'Current earnings')}</div><div className="value"><Money value={balance.data.currentEarnings} /></div></div>
                <div className="summary-cell"><div className="label">{tr('الالتزامات + الملكية', 'Liabilities + equity')}</div><div className="value"><Money value={balance.data.totalLiabilitiesAndEquity} bold /></div></div>
                <div className="summary-cell"><div className="label">{tr('متوازنة', 'Balanced')}</div><div className="value">{balance.data.balanced ? '✓' : '✗'}</div></div>
              </div>
            </Card>
          </>
        ) : null
      ) : null}

      {tab === 'cashflow' ? (
        cashflow.loading && !cashflow.data ? <Loading /> : cashflow.error ? <ErrorNote error={cashflow.error} /> : cashflow.data ? (
          <Card>
            <CardHead title={tr('التدفقات النقدية', 'Cash flow')} sub={`${tr('افتتاحي', 'Opening')}: ${cashflow.data.openingCash}`} />
            <DataTable<{ source: string; inflow: string; outflow: string; net: string }>
              rows={cashflow.data.lines}
              rowKey={(r) => r.source}
              columns={[
                { key: 'source', header: tr('المصدر', 'Source'), render: (r) => r.source },
                { key: 'in', header: tr('وارد', 'Inflow'), align: 'end', render: (r) => <Money value={r.inflow} /> },
                { key: 'out', header: tr('صادر', 'Outflow'), align: 'end', render: (r) => <Money value={r.outflow} /> },
                { key: 'net', header: tr('الصافي', 'Net'), align: 'end', render: (r) => <Money value={r.net} bold /> },
              ]}
              empty={<EmptyState title={tr('لا توجد حركات', 'No movements')} />}
            />
            {cashflow.data.closingCash !== undefined ? (
              <div className="mt-16"><Badge tone="info">{tr('ختامي', 'Closing')}: <Money value={cashflow.data.closingCash} bold /></Badge></div>
            ) : null}
          </Card>
        ) : null
      ) : null}

      {(tab === 'agingc' || tab === 'agings') ? (
        (tab === 'agingc' ? agingC : agingS).loading && !(tab === 'agingc' ? agingC.data : agingS.data) ? <Loading /> :
        (tab === 'agingc' ? agingC.error : agingS.error) ? <ErrorNote error={tab === 'agingc' ? agingC.error : agingS.error} /> :
        (tab === 'agingc' ? agingC.data : agingS.data) ? (
          <Card>
            <DataTable<AgingRow>
              rows={(tab === 'agingc' ? agingC.data! : agingS.data!).rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code}</span> },
                { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
                { key: 'cur', header: tr('غير مستحق', 'Current'), align: 'end', render: (r) => <Money value={r.current} /> },
                { key: 'd30', header: tr('1–30', '1–30'), align: 'end', render: (r) => <Money value={r.days1to30} /> },
                { key: 'd60', header: tr('31–60', '31–60'), align: 'end', render: (r) => <Money value={r.days31to60} /> },
                { key: 'd90', header: tr('61–90', '61–90'), align: 'end', render: (r) => <Money value={r.days61to90} /> },
                { key: 'over', header: tr('>90', '>90'), align: 'end', render: (r) => <Money value={r.over90} /> },
                { key: 'tot', header: tr('الإجمالي', 'Total'), align: 'end', render: (r) => <Money value={r.total} bold /> },
              ]}
              empty={<EmptyState title={tr('لا توجد بيانات', 'No data')} />}
            />
            <div className="mt-16">
              <SummaryStrip
                items={[
                  { label: tr('الإجمالي', 'Total'), value: <Money value={(tab === 'agingc' ? agingC.data! : agingS.data!).totals.total} bold /> },
                  { label: tr('دفعات مقدمة', 'Unapplied'), value: <Money value={(tab === 'agingc' ? agingC.data! : agingS.data!).totals.unappliedCredit} /> },
                ]}
              />
            </div>
          </Card>
        ) : null
      ) : null}

      {tab === 'profit' ? (
        profit.loading && !profit.data ? <Loading /> : profit.error ? <ErrorNote error={profit.error} /> : profit.data ? (
          <Card>
            <CardHead title={tr('الربحية', 'Profitability')} sub={`${profit.data.from} → ${profit.data.to}`} />
            <DataTable<ProfitRow>
              rows={profit.data.rows}
              rowKey={(r) => r.key}
              columns={[
                { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code || '—'}</span> },
                { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
                { key: 'qty', header: tr('الكمية', 'Qty'), align: 'end', render: (r) => <Qty value={r.quantity} /> },
                { key: 'rev', header: tr('الإيراد', 'Revenue'), align: 'end', render: (r) => <Money value={r.revenue} /> },
                { key: 'cost', header: tr('التكلفة', 'Cost'), align: 'end', render: (r) => <Money value={r.cost} /> },
                { key: 'profit', header: tr('الربح', 'Profit'), align: 'end', render: (r) => <Money value={r.profit} bold /> },
                { key: 'margin', header: tr('الهامش %', 'Margin %'), align: 'end', render: (r) => `${r.marginPercent}%` },
                { key: 'inv', header: tr('فواتير', 'Invoices'), align: 'end', render: (r) => r.invoices },
              ]}
              empty={<EmptyState title={tr('لا توجد بيانات', 'No data')} />}
              footer={
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>{tr('الإجمالي', 'Total')}</td>
                  <td style={{ textAlign: 'end', fontWeight: 700 }}><Money value={profit.data.totals.cost} /></td>
                  <td style={{ textAlign: 'end', fontWeight: 700 }}><Money value={profit.data.totals.profit} bold /></td>
                  <td style={{ textAlign: 'end', fontWeight: 700 }}>{profit.data.totals.marginPercent}%</td>
                  <td />
                </tr>
              }
            />
          </Card>
        ) : null
      ) : null}

      {tab === 'export' ? (
        <Card>
          <div className="form-grid" style={{ padding: 16 }}>
            <Field label={tr('التقرير', 'Report')} className="col-6">
              <Select value={exportName} onChange={(e) => setExportName(e.target.value)}>
                {REPORT_NAMES.map((r) => <option key={r.value} value={r.value}>{tr(r.label[0], r.label[1])}</option>)}
              </Select>
            </Field>
            <Field label={tr('الصيغة', 'Format')} className="col-3">
              <Select value={exportFmt} onChange={(e) => setExportFmt(e.target.value as 'xlsx' | 'pdf')}>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="pdf">PDF</option>
              </Select>
            </Field>
            <Field label={tr('اللغة', 'Language')} className="col-3">
              <Select value={lang} onChange={() => {}}>
                <option value={lang}>{lang === 'ar' ? 'العربية' : 'English'}</option>
              </Select>
            </Field>
            <Field label={tr('من تاريخ / كما في', 'From / as of')} className="col-4"><Input type="date" dir="ltr" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <Field label={tr('إلى تاريخ', 'To')} className="col-4"><Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <div className="col-4" style={{ display: 'flex', alignItems: 'end' }}>
              <Button icon="download" onClick={() => download(exportUrl(exportName))}>{tr('تصدير', 'Export')}</Button>
            </div>
          </div>
          <div className="hint" style={{ padding: '0 16px 16px' }}>
            {tr('يتم إنشاء التقرير من القيود المرحّلة فقط.', 'Reports are generated from posted journal entries only.')}
          </div>
        </Card>
      ) : null}
    </>
  );
}
