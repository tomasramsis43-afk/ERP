'use client';

import React, { useEffect, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Button, Card, DataTable, DateText, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { ResourcePage } from '@/components/ResourcePage';
import { useApi, usePaged } from '@/lib/hooks';
import { post } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface Vehicle { id: string; plateNumber: string; model: string; driverName: string | null; routeId: string | null; licenseExpiry: string | null; insuranceExpiry: string | null; isActive: boolean }
interface Expense { id: string; category: string; date: string; amount: string; description: string | null }

export default function VehiclesPage() {
  const { tr, lang } = useApp();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expVehicle, setExpVehicle] = useState<Vehicle | null>(null);
  return (
    <>
      <PageHeader title={tr('السيارات', 'Vehicles')} sub={tr('السيارات و renewals والمصروفات', 'Vehicles, renewals and expenses')}>
      </PageHeader>
      <ResourcePage<Vehicle>
        title={tr('السيارات', 'Vehicles')}
        endpoint="vehicles"
        searchPlaceholder={tr('ابحث باللوحة…', 'Search plate…')}
        columns={[
          { key: 'plate', header: tr('اللوحة', 'Plate'), width: '130px', render: (r) => <span className="tree-code">{r.plateNumber}</span> },
          { key: 'model', header: tr('الموديل', 'Model'), render: (r) => r.model },
          { key: 'driver', header: tr('السائق', 'Driver'), render: (r) => r.driverName ?? '—' },
          { key: 'license', header: tr('انتهاء الرخصة', 'License expiry'), render: (r) => <DateText value={r.licenseExpiry} /> },
          { key: 'insurance', header: tr('انتهاء التأمين', 'Insurance expiry'), render: (r) => <DateText value={r.insuranceExpiry} /> },
          { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
        ]}
        fields={[
          { name: 'plateNumber', label: tr('رقم اللوحة', 'Plate number'), required: true, hideInEdit: true, col: 'col-4' },
          { name: 'model', label: tr('الموديل', 'Model'), required: true, col: 'col-4' },
          { name: 'driverName', label: tr('اسم السائق', 'Driver name'), col: 'col-4' },
          { name: 'routeId', label: tr('الخط', 'Route'), col: 'col-4' },
          { name: 'licenseExpiry', label: tr('انتهاء الرخصة', 'License expiry'), type: 'date', col: 'col-4' },
          { name: 'insuranceExpiry', label: tr('انتهاء التأمين', 'Insurance expiry'), type: 'date', col: 'col-4' },
          { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-4' },
        ]}
        createLabel={tr('سيارة جديدة', 'New vehicle')}
        rowActions={(r) => (
          <>
            <IconButton icon="receipt" title={tr('المصروفات', 'Expenses')} onClick={() => setExpVehicle(r)} />
          </>
        )}
      />
      <VehicleExpensesModal vehicle={expVehicle} onClose={() => setExpVehicle(null)} />
    </>
  );
}

import { Badge } from '@/components/ui';

function VehicleExpensesModal({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const accounts = useApi<any[]>('financial-accounts');
  const { data, error, loading, reload } = usePaged<Expense>(vehicle ? `vehicles/${vehicle.id}/expenses?${queryString({ page, pageSize })}` : null);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line
  const [form, setForm] = useState({ category: 'FUEL', date: today(), amount: '', financialAccountId: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);
  useEffect(() => { if (creating) setForm({ category: 'FUEL', date: today(), amount: '', financialAccountId: '', description: '' }); }, [creating]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    setBusy(true); setFerr(null);
    try {
      await post(`vehicles/${vehicle.id}/expenses`, { idempotencyKey: crypto.randomUUID(), category: form.category, date: form.date, amount: form.amount, financialAccountId: form.financialAccountId, description: form.description || undefined });
      toast.success(tr('تم تسجيل المصروف', 'Expense recorded'));
      setCreating(false);
      setRefreshKey((n) => n + 1);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  if (!vehicle) return null;
  return (
    <Modal open onClose={onClose} title={`${tr('مصروفات', 'Expenses')} · ${vehicle.plateNumber}`} size="xl">
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('مصروف جديد', 'New expense')}</Button>
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <DataTable<Expense>
            rows={data.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.date} /> },
              { key: 'cat', header: tr('التصنيف', 'Category'), render: (r) => r.category },
              { key: 'amount', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} bold /> },
              { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.description ?? '—' },
            ]}
            empty={<EmptyState title={tr('لا توجد مصروفات', 'No expenses')} />}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      ) : null}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('مصروف سيارة', 'Vehicle expense')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="ve-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="ve-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label={tr('التصنيف', 'Category')} required className="col-4">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="FUEL">{tr('وقود', 'Fuel')}</option>
                <option value="MAINTENANCE">{tr('صيانة', 'Maintenance')}</option>
                <option value="LICENSE">{tr('رخصة', 'License')}</option>
                <option value="INSURANCE">{tr('تأمين', 'Insurance')}</option>
                <option value="OTHER">{tr('أخرى', 'Other')}</option>
              </Select>
            </Field>
            <Field label={tr('التاريخ', 'Date')} required className="col-4"><Input type="date" dir="ltr" value={form.date} required onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label={tr('المبلغ', 'Amount')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={form.amount} required onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={tr('الحساب', 'Account')} required className="col-6">
              <Select value={form.financialAccountId} required onChange={(e) => setForm({ ...form, financialAccountId: e.target.value })}>
                <option value="">—</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('البيان', 'Description')} className="col-6"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </Modal>
  );
}
