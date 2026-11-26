'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, DateText, DetailGrid, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Qty, Select, SummaryStrip, Tabs, Textarea } from '@/components/ui';
import { ResourcePage } from '@/components/ResourcePage';
import { useApi, usePaged } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface Rep { id: string; code: string; nameAr: string; nameEn: string | null; isActive: boolean; custodyBalance?: string; route?: { nameAr: string } | null; vehicle?: { plateNumber: string; warehouse?: { id: string } } | null }

export default function RepresentativesPage() {
  const { tr, lang } = useApp();
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  return (
    <>
      <PageHeader title={tr('المناديب', 'Representatives')} sub={tr('العهد والتسويات والعمولات', 'Custody, settlements and commissions')}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('مندوب جديد', 'New representative')}</Button>
      </PageHeader>
      <ResourcePage<Rep>
        title={tr('المناديب', 'Representatives')}
        endpoint="representatives"
        searchPlaceholder={tr('ابحث…', 'Search…')}
        columns={[
          { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code}</span> },
          { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
          { key: 'route', header: tr('الخط', 'Route'), render: (r) => r.route?.nameAr ?? '—' },
          { key: 'vehicle', header: tr('السيارة', 'Vehicle'), render: (r) => r.vehicle?.plateNumber ?? '—' },
          { key: 'custody', header: tr('رصيد العهدة', 'Custody balance'), align: 'end', render: (r) => <Money value={r.custodyBalance ?? '0'} bold /> },
          { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
        ]}
        fields={[
          { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-4' },
          { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-4' },
          { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), required: true, col: 'col-4' },
          { name: 'phone', label: tr('الهاتف', 'Phone'), type: 'tel', col: 'col-4' },
          { name: 'jobTitle', label: tr('المسمى', 'Job title'), col: 'col-4' },
          { name: 'baseSalary', label: tr('الراتب', 'Salary'), type: 'money', col: 'col-4' },
          { name: 'routeId', label: tr('الخط', 'Route'), col: 'col-4' },
          { name: 'vehicleId', label: tr('السيارة', 'Vehicle'), col: 'col-4' },
          { name: 'financialAccountId', label: tr('حساب العهدة', 'Custody account'), col: 'col-4' },
          { name: 'userId', label: tr('المستخدم', 'User'), col: 'col-4' },
          { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-4' },
        ]}
        createLabel={tr('مندوب جديد', 'New representative')}
        onRowClick={(r) => setDetailId(r.id)}
        renderDetail={(r) => <RepDetail rep={r} />}
      />
      {/* detail modal handled by renderDetail above */}
    </>
  );
}

// need Badge import
function RepDetail({ rep }: { rep: Rep }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`representatives/${rep.id}`);
  const [tab, setTab] = useState<'info' | 'closing' | 'commissions'>('info');
  const [closeDate, setCloseDate] = useState(today());
  const [preview, setPreview] = useState<any>(null);
  const [declaredCash, setDeclaredCash] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<any>(null);
  const accounts = useApi<any[]>('financial-accounts');

  useEffect(() => {
    if (tab === 'commissions' && rep.id) {
      fetch(`/api/proxy/representatives/${rep.id}/commissions`).then((r) => r.json()).then(setCommissions).catch(() => undefined);
    }
  }, [tab, rep.id]);

  async function loadPreview() {
    setBusy(true); setFerr(null);
    try {
      const p = await get<any>(`representatives/${rep.id}/closing-preview?date=${closeDate}`);
      setPreview(p);
      setDeclaredCash(p.expectedCash ?? '');
      const c: Record<string, string> = {};
      for (const l of p.lines ?? []) c[l.productId] = String(l.expectedQty ?? l.countedQty ?? 0);
      setCounts(c);
    } catch (e) { setFerr((e as Error).message); }
    finally { setBusy(false); }
  }

  // Use api helper properly
  useEffect(() => { /* placeholder */ }, []);

  async function doClose() {
    setBusy(true); setFerr(null);
    try {
      await post(`representatives/${rep.id}/close-day`, {
        date: closeDate,
        declaredCash,
        counts: Object.entries(counts).map(([productId, quantity]) => ({ productId, quantity })),
      });
      toast.success(tr('تم إقفال اليوم', 'Day closed'));
      reload();
    } catch (e) { setFerr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function payCommissions() {
    setBusy(true); setFerr(null);
    try {
      await post(`representatives/${rep.id}/commissions/pay`, { idempotencyKey: crypto.randomUUID(), date: today(), financialAccountId: accounts.data?.[0]?.id });
      toast.success(tr('تم صرف العمولات', 'Commissions paid'));
    } catch (e) { setFerr((e as Error).message); }
    finally { setBusy(false); }
  }

  const d = data ?? rep;

  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'info', label: tr('البيانات', 'Details') },
        { id: 'closing', label: tr('إقفال اليوم', 'Close day') },
        { id: 'commissions', label: tr('العمولات', 'Commissions') },
      ]} />
      <div className="mt-16">
        {tab === 'info' ? (
          <>
            <SummaryStrip items={[
              { label: tr('رصيد العهدة', 'Custody balance'), value: <Money value={d.custodyBalance ?? '0'} bold /> },
              { label: tr('السيارة', 'Vehicle'), value: d.vehicle?.plateNumber ?? '—' },
            ]} />
            <div className="mt-16">
              <DetailGrid items={[
                { label: tr('الكود', 'Code'), value: d.code },
                { label: tr('الاسم', 'Name'), value: lang === 'ar' ? d.nameAr : d.nameEn || d.nameAr },
                { label: tr('الخط', 'Route'), value: d.route?.nameAr ?? '—' },
                { label: tr('الحالة', 'Status'), value: d.isActive ? tr('نشط', 'Active') : tr('موقوف', 'Inactive') },
              ]} />
            </div>
            <div className="mt-16">
              <div className="section-title">{tr('مخزون السيارة', 'Vehicle stock')}</div>
              <DataTable<any>
                rows={d.vehicleStock ?? []}
                rowKey={(r, i) => r.productId ?? String(i)}
                columns={[
                  { key: 'code', header: tr('الكود', 'Code'), render: (r) => r.product?.code },
                  { key: 'name', header: tr('الصنف', 'Product'), render: (r) => (lang === 'ar' ? r.product?.nameAr : r.product?.nameEn) },
                  { key: 'qty', header: tr('الكمية', 'Qty'), align: 'end', render: (r) => <Qty value={r.quantity} /> },
                ]}
                empty={<EmptyState title={tr('لا يوجد مخزون', 'No stock')} />}
              />
            </div>
          </>
        ) : null}

        {tab === 'closing' ? (
          <>
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <Input type="date" dir="ltr" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={{ width: 160 }} />
              <Button loading={busy} onClick={loadPreview}>{tr('معاينة', 'Preview')}</Button>
            </div>
            <ErrorNote error={ferr} />
            {preview ? (
              <>
                <SummaryStrip items={[
                  { label: tr('النقدية المتوقعة', 'Expected cash'), value: <Money value={preview.expectedCash} bold /> },
                  { label: tr('مبيعات نقدية', 'Cash sales'), value: <Money value={preview.salesCash} /> },
                  { label: tr('مبيعات آجلة', 'Credit sales'), value: <Money value={preview.salesCredit} /> },
                  { label: tr('التحصيلات', 'Collections'), value: <Money value={preview.collections} /> },
                ]} />
                <div className="mt-16">
                  <Field label={tr('النقدية المُعلنة', 'Declared cash')} required>
                    <Input type="number" min="0" step="0.01" dir="ltr" value={declaredCash} onChange={(e) => setDeclaredCash(e.target.value)} />
                  </Field>
                </div>
                <div className="table-wrap mt-16">
                  <table className="table">
                    <thead><tr><th>{tr('الصنف', 'Product')}</th><th>{tr('المتوقع', 'Expected')}</th><th>{tr('المعدود', 'Counted')}</th></tr></thead>
                    <tbody>
                      {(preview.lines ?? []).map((l: any) => (
                        <tr key={l.productId}>
                          <td>{(l.product && (lang === 'ar' ? l.product.nameAr : l.product.nameEn)) || l.productId}</td>
                          <td><Qty value={l.expectedQty} /></td>
                          <td><Input type="number" min="0" step="0.0001" dir="ltr" value={counts[l.productId] ?? ''} onChange={(e) => setCounts({ ...counts, [l.productId]: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="page-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <Button loading={busy} onClick={doClose}>{tr('إقفال اليوم', 'Close day')}</Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'commissions' ? (
          <>
            <ErrorNote error={ferr} />
            <Button loading={busy} onClick={payCommissions} style={{ marginBottom: 12 }}>{tr('صرف العمولات', 'Pay commissions')}</Button>
            <DataTable<any>
              rows={commissions?.items ?? []}
              rowKey={(r, i) => r.id ?? String(i)}
              columns={[
                { key: 'period', header: tr('الفترة', 'Period'), render: (r) => r.period ?? '—' },
                { key: 'amount', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount ?? r.total} /> },
                { key: 'paid', header: tr('الحالة', 'Status'), render: (r) => (r.paid ? tr('مدفوع', 'Paid') : tr('مستحق', 'Due')) },
              ]}
              empty={<EmptyState title={tr('لا توجد عمولات', 'No commissions')} />}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
