'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp, useConfirm, useToast } from '@/components/Providers';
import { Badge, Button, DataTable, DateText, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pagination, Qty, Select, Textarea } from '@/components/ui';
import { can, useApi, useMe, useOptions, usePaged } from '@/lib/hooks';
import { get, post, put } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface CountRow { id: string; number: number; status: 'DRAFT' | 'APPROVED' | 'CANCELLED'; countDate: string; note: string | null; warehouse: { code: string; nameAr: string; nameEn: string }; _count: { lines: number } }
interface CountLine { id: string; productId: string; systemQty: string; countedQty: string | null; product: { code: string; nameAr: string; nameEn: string } }
interface CountFull extends Omit<CountRow, '_count'> { lines: CountLine[]; result?: { adjusted: number; surplusValue: string; shortageValue: string } }

export default function StockCountsPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const me = useMe();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const list = usePaged<CountRow>(`inventory/counts?${queryString({ page, pageSize: 20, status })}`);
  const warehouses = useOptions<{ id: string; code: string; nameAr: string; nameEn: string }>('warehouses', (w) => ({ value: w.id, label: `${lang === 'ar' ? w.nameAr : w.nameEn} (${w.code})` }));
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ warehouseId: '', countDate: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const c = await post<CountFull>('inventory/counts', { warehouseId: form.warehouseId, countDate: form.countDate, ...(form.note.trim() ? { note: form.note.trim() } : {}) });
      toast.success(tr('تم إنشاء الجرد', 'Count created'));
      setCreating(false); setForm({ warehouseId: '', countDate: today(), note: '' });
      list.reload();
      setOpenId(c.id);
    } catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  const badge = (s: CountRow['status']) => (s === 'APPROVED' ? <Badge tone="ok">{tr('معتمد', 'Approved')}</Badge> : s === 'CANCELLED' ? <Badge tone="danger">{tr('ملغى', 'Cancelled')}</Badge> : <Badge tone="warn">{tr('مفتوح', 'Open')}</Badge>);

  return (
    <>
      <PageHeader title={tr('الجرد المخزني', 'Stock counts')} sub={tr('عدّ فعلي للأصناف واعتماد الفروقات كتسويات مخزون وقيود', 'Physical counts; approved differences become stock adjustments and journal entries')}>
        <Link href="/inventory" className="btn ghost">{tr('المخزون', 'Inventory')}</Link>
        {can(me, 'inventory:create') ? <Button icon="plus" onClick={() => setCreating(true)}>{tr('جرد جديد', 'New count')}</Button> : null}
      </PageHeader>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">{tr('كل الحالات', 'All statuses')}</option>
          <option value="DRAFT">{tr('مفتوح', 'Open')}</option>
          <option value="APPROVED">{tr('معتمد', 'Approved')}</option>
          <option value="CANCELLED">{tr('ملغى', 'Cancelled')}</option>
        </Select>
      </div>
      <ErrorNote error={list.error} />
      {list.loading && !list.data ? <Loading /> : (
        <DataTable<CountRow>
          rows={list.data?.items ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          columns={[
            { key: 'n', header: '#', width: '80px', render: (r) => r.number },
            { key: 'd', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.countDate} /> },
            { key: 'w', header: tr('المخزن', 'Warehouse'), render: (r) => (lang === 'ar' ? r.warehouse.nameAr : r.warehouse.nameEn) },
            { key: 'l', header: tr('الأصناف', 'Lines'), align: 'end', render: (r) => r._count.lines },
            { key: 's', header: tr('الحالة', 'Status'), align: 'center', render: (r) => badge(r.status) },
            { key: 'o', header: tr('ملاحظات', 'Note'), render: (r) => r.note ?? '—' },
          ]}
          empty={<EmptyState title={tr('لا توجد عمليات جرد', 'No stock counts')} />}
        />
      )}
      {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('جرد جديد', 'New stock count')} footer={<Button type="submit" form="count-form" loading={busy} disabled={!form.warehouseId}>{tr('إنشاء', 'Create')}</Button>}>
        <form id="count-form" onSubmit={create}>
          <ErrorNote error={err} />
          <div className="form-grid">
            <Field label={tr('المخزن', 'Warehouse')} required className="col-6" hint={tr('تُدرج كل الأصناف ذات الرصيد في المخزن', 'Every product with a balance is added to the sheet')}>
              <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">{tr('اختر…', 'Select…')}</option>
                {warehouses.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label={tr('تاريخ الجرد', 'Count date')} required className="col-6">
              <Input type="date" dir="ltr" max={today()} value={form.countDate} onChange={(e) => setForm({ ...form, countDate: e.target.value })} />
            </Field>
            <Field label={tr('ملاحظات', 'Note')} className="col-12"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      {openId ? <CountSheet id={openId} onClose={() => { setOpenId(null); list.reload(); }} /> : null}
    </>
  );
}

function CountSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const me = useMe();
  const { data, error, loading, reload } = useApi<CountFull>(`inventory/counts/${id}`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const draft = data?.status === 'DRAFT';

  const shown = (l: CountLine) => values[l.productId] ?? (l.countedQty ?? '');
  const diff = (l: CountLine) => { const v = shown(l); return v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v) - Number(l.systemQty); };
  const dirty = Object.entries(values).filter(([, v]) => v.trim() !== '' && !Number.isNaN(Number(v)));

  async function save(): Promise<boolean> {
    if (dirty.length === 0) return true;
    setBusy(true); setErr(null);
    try {
      await put(`inventory/counts/${id}/lines`, { lines: dirty.map(([productId, countedQty]) => ({ productId, countedQty })) });
      setValues({}); reload();
      return true;
    } catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!(await save())) return;
    const fresh = await get<CountFull>(`inventory/counts/${id}`);
    const counted = fresh.lines.filter((l) => l.countedQty !== null);
    const changed = counted.filter((l) => Number(l.countedQty) !== Number(l.systemQty)).length;
    const ok = await confirm({
      title: tr('اعتماد الجرد', 'Approve count'),
      message: tr(`سيتم عدّ ${counted.length} صنف (${fresh.lines.length - counted.length} غير معدود سيُتجاهل) وتسوية ${changed} صنف بقيود محاسبية. الفرق يُحسب على الرصيد الحالي للنظام.`, `${counted.length} counted lines (${fresh.lines.length - counted.length} uncounted are ignored); ${changed} will be adjusted with journal entries. Differences are measured against the current system balance.`),
      confirmLabel: tr('اعتماد', 'Approve'),
      danger: changed > 0,
    });
    if (!ok) return;
    setBusy(true); setErr(null);
    try { await post(`inventory/counts/${id}/approve`); toast.success(tr('تم اعتماد الجرد', 'Count approved')); reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    const ok = await confirm({ title: tr('إلغاء الجرد', 'Cancel count'), message: tr('لن يتأثر المخزون. لا يمكن إعادة فتح الجرد.', 'Stock is not affected. The count cannot be reopened.'), confirmLabel: tr('إلغاء الجرد', 'Cancel count'), danger: true });
    if (!ok) return;
    setBusy(true); setErr(null);
    try { await post(`inventory/counts/${id}/cancel`); toast.success(tr('تم الإلغاء', 'Cancelled')); reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={data ? `${tr('جرد', 'Count')} #${data.number}` : tr('جرد', 'Count')}
      subtitle={data ? `${lang === 'ar' ? data.warehouse.nameAr : data.warehouse.nameEn} — ${data.countDate.slice(0, 10)}` : undefined}
      footer={draft ? (
        <>
          {can(me, 'inventory:update') ? <Button variant="ghost" loading={busy} onClick={cancel}>{tr('إلغاء الجرد', 'Cancel count')}</Button> : null}
          {can(me, 'inventory:update') ? <Button variant="ghost" loading={busy} disabled={dirty.length === 0} onClick={() => { void save().then((ok) => ok && toast.success(tr('تم الحفظ', 'Saved'))); }}>{tr('حفظ العدّ', 'Save counts')}</Button> : null}
          {can(me, 'inventory:approve') ? <Button loading={busy} onClick={approve}>{tr('اعتماد', 'Approve')}</Button> : null}
        </>
      ) : undefined}>
      <ErrorNote error={err ?? error} />
      {loading && !data ? <Loading /> : data ? (
        <>
          {data.status !== 'DRAFT' ? <div style={{ marginBottom: 8 }}><Badge tone={data.status === 'APPROVED' ? 'ok' : 'danger'}>{data.status === 'APPROVED' ? tr('معتمد', 'Approved') : tr('ملغى', 'Cancelled')}</Badge></div> : null}
          <DataTable<CountLine>
            rows={data.lines}
            rowKey={(l) => l.id}
            columns={[
              { key: 'c', header: tr('الكود', 'Code'), width: '110px', render: (l) => <span className="tree-code">{l.product.code}</span> },
              { key: 'n', header: tr('الصنف', 'Product'), render: (l) => (lang === 'ar' ? l.product.nameAr : l.product.nameEn) },
              { key: 's', header: tr('رصيد النظام', 'System'), align: 'end', render: (l) => <Qty value={l.systemQty} /> },
              { key: 'k', header: tr('المعدود فعلياً', 'Counted'), align: 'end', width: '150px', render: (l) => draft ? (
                <Input type="number" min="0" step="0.0001" dir="ltr" value={shown(l)} onChange={(e) => setValues({ ...values, [l.productId]: e.target.value })} />
              ) : (l.countedQty === null ? '—' : <Qty value={l.countedQty} />) },
              { key: 'd', header: tr('الفرق', 'Diff'), align: 'center', width: '90px', render: (l) => { const d = diff(l); return d === null ? '—' : <Badge tone={d === 0 ? 'ok' : 'danger'}>{d}</Badge>; } },
            ]}
            empty={<EmptyState title={tr('لا توجد أصناف في هذا المخزن', 'No products in this warehouse')} />}
          />
        </>
      ) : null}
    </Modal>
  );
}
