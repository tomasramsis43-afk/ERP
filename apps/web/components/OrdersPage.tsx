'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp, useConfirm, useToast } from '@/components/Providers';
import { Badge, Button, DataTable, DateText, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Qty, Select, Textarea } from '@/components/ui';
import { can, useApi, useMe, useOptions, usePaged } from '@/lib/hooks';
import { post, uuid } from '@/lib/api';
import { queryString, today } from '@/lib/format';
import { ProductPicker, ProductLite } from './ProductPicker';

type Side = 'sales' | 'purchases';
interface OrderRow { id: string; number: number; kind?: 'QUOTATION' | 'ORDER'; status: string; docDate?: string; orderDate?: string; validUntil?: string | null; expectedDate?: string | null; subtotal: string; customer?: { code: string; nameAr: string }; supplier?: { code: string; nameAr: string }; warehouse: { nameAr: string; nameEn: string }; _count: { lines: number } }
interface OrderLine { id: string; productId: string; unitId: string | null; enteredQty: string; baseQty: string; unitPrice: string; lineNet: string; product: { code: string; nameAr: string; nameEn: string } }
interface OrderFull extends Omit<OrderRow, '_count'> { note: string | null; lines: OrderLine[]; progress: { productId: string; ordered: string; received?: string; invoiced?: string; remaining: string }[]; invoices: { id: string; number: number; invoiceDate: string; status: string; total: string }[] }
interface Draft { key: string; product: ProductLite | null; unitId: string; qty: string; price: string; touched: boolean }
const blank = (): Draft => ({ key: uuid(), product: null, unitId: '', qty: '1', price: '', touched: false });

export function OrdersPage({ side }: { side: Side }) {
  const { tr } = useApp();
  const me = useMe();
  const isSales = side === 'sales';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = usePaged<OrderRow>(`${side}/orders?${queryString({ page, pageSize: 20, status, ...(isSales ? { kind } : {}) })}`);

  const statuses = isSales
    ? [['OPEN', tr('مفتوح', 'Open')], ['PARTIALLY_INVOICED', tr('منفّذ جزئياً', 'Partly invoiced')], ['INVOICED', tr('منفّذ', 'Invoiced')], ['CANCELLED', tr('ملغى', 'Cancelled')]]
    : [['OPEN', tr('مفتوح', 'Open')], ['PARTIALLY_RECEIVED', tr('مستلم جزئياً', 'Partly received')], ['RECEIVED', tr('مستلم', 'Received')], ['CANCELLED', tr('ملغى', 'Cancelled')]];
  const label = (s: string) => statuses.find((x) => x[0] === s)?.[1] ?? s;
  const tone = (s: string) => (s === 'CANCELLED' ? 'danger' : s === 'OPEN' ? 'warn' : s === 'PARTIALLY_INVOICED' || s === 'PARTIALLY_RECEIVED' ? 'warn' : 'ok') as 'ok' | 'warn' | 'danger';

  return (
    <>
      <PageHeader title={isSales ? tr('عروض الأسعار وأوامر البيع', 'Quotations & sales orders') : tr('أوامر الشراء', 'Purchase orders')}
        sub={isSales ? tr('لا تؤثر على المخزون أو الحسابات حتى تُنفَّذ بفاتورة', 'No stock or accounting effect until invoiced') : tr('لا تؤثر على المخزون أو الحسابات حتى يتم الاستلام بفاتورة شراء', 'No stock or accounting effect until received by an invoice')}>
        <Link href={`/${side}`} className="btn ghost">{isSales ? tr('الفواتير', 'Invoices') : tr('الفواتير', 'Invoices')}</Link>
        {can(me, `${side}:create`) ? <Button icon="plus" onClick={() => setCreating(true)}>{isSales ? tr('مستند جديد', 'New document') : tr('أمر شراء', 'New order')}</Button> : null}
      </PageHeader>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        {isSales ? (
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">{tr('الكل', 'All')}</option>
            <option value="QUOTATION">{tr('عروض أسعار', 'Quotations')}</option>
            <option value="ORDER">{tr('أوامر بيع', 'Sales orders')}</option>
          </Select>
        ) : null}
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 170 }}>
          <option value="">{tr('كل الحالات', 'All statuses')}</option>
          {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <ErrorNote error={list.error} />
      {list.loading && !list.data ? <Loading /> : (
        <DataTable<OrderRow>
          rows={list.data?.items ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          columns={[
            { key: 'n', header: '#', width: '80px', render: (r) => r.number },
            ...(isSales ? [{ key: 'k', header: tr('النوع', 'Type'), render: (r: OrderRow) => (r.kind === 'ORDER' ? tr('أمر بيع', 'Order') : tr('عرض سعر', 'Quotation')) }] : []),
            { key: 'd', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={(r.docDate ?? r.orderDate)!} /> },
            { key: 'p', header: isSales ? tr('العميل', 'Customer') : tr('المورد', 'Supplier'), render: (r) => (r.customer ?? r.supplier)?.nameAr },
            { key: 'w', header: tr('المخزن', 'Warehouse'), render: (r) => r.warehouse.nameAr },
            { key: 't', header: tr('القيمة', 'Value'), align: 'end', render: (r) => <Money value={r.subtotal} /> },
            { key: 's', header: tr('الحالة', 'Status'), align: 'center', render: (r) => <Badge tone={tone(r.status)}>{label(r.status)}</Badge> },
          ]}
          empty={<EmptyState title={tr('لا توجد مستندات', 'No documents')} />}
        />
      )}
      {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
      {creating ? <OrderForm side={side} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); list.reload(); setOpenId(id); }} /> : null}
      {openId ? <OrderDetail side={side} id={openId} label={label} tone={tone} onClose={() => { setOpenId(null); list.reload(); }} /> : null}
    </>
  );
}

function OrderForm({ side, onClose, onSaved }: { side: Side; onClose: () => void; onSaved: (id: string) => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const isSales = side === 'sales';
  const parties = useOptions<{ id: string; code: string; nameAr: string }>(`${isSales ? 'customers' : 'suppliers'}?pageSize=100`, (p) => ({ value: p.id, label: `${p.nameAr} (${p.code})` }));
  const warehouses = useOptions<{ id: string; code: string; nameAr: string; nameEn: string }>('warehouses', (w) => ({ value: w.id, label: `${lang === 'ar' ? w.nameAr : w.nameEn} (${w.code})` }));
  const [kind, setKind] = useState<'QUOTATION' | 'ORDER'>('QUOTATION');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(today());
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Draft[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const factor = (l: Draft) => (!l.product || !l.unitId || l.unitId === l.product.baseUnitId ? 1 : Number(l.product.units?.find((u) => u.unitId === l.unitId)?.factor ?? 1));
  const defaultPrice = (l: Draft) => (l.product ? Number(isSales ? l.product.retailPrice : l.product.purchasePrice) * factor(l) : 0);
  const priceOf = (l: Draft) => (l.touched ? Number(l.price || 0) : defaultPrice(l));
  const total = lines.reduce((a, l) => a + Number(l.qty || 0) * priceOf(l), 0);
  const patch = (key: string, p: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const valid = lines.filter((l) => l.product && Number(l.qty) > 0);
      if (valid.length === 0) throw new Error(tr('أضف صنفاً واحداً على الأقل', 'Add at least one product'));
      const ids = valid.map((l) => l.product!.id);
      if (new Set(ids).size !== ids.length) throw new Error(tr('لا تكرر نفس الصنف في أكثر من بند', 'Do not repeat the same product on several lines'));
      const body: Record<string, unknown> = {
        warehouseId, note: note || undefined,
        lines: valid.map((l) => ({ productId: l.product!.id, quantity: l.qty, ...(l.unitId && l.unitId !== l.product!.baseUnitId ? { unitId: l.unitId } : {}), unitPrice: priceOf(l).toFixed(4) })),
      };
      if (isSales) Object.assign(body, { kind, customerId: partyId, docDate: date, ...(until ? { validUntil: until } : {}) });
      else Object.assign(body, { supplierId: partyId, orderDate: date, ...(until ? { expectedDate: until } : {}) });
      const saved = await post<{ id: string; number: number }>(`${side}/orders`, body);
      toast.success(`${tr('تم الحفظ', 'Saved')} #${saved.number}`);
      onSaved(saved.id);
    } catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={isSales ? tr('مستند مبيعات جديد', 'New sales document') : tr('أمر شراء جديد', 'New purchase order')}
      footer={<><div style={{ marginInlineEnd: 'auto', fontWeight: 700 }}>{tr('الإجمالي', 'Total')}: <Money value={total.toFixed(2)} bold /></div><Button type="submit" form="order-form" loading={busy} disabled={!partyId || !warehouseId}>{tr('حفظ', 'Save')}</Button></>}>
      <form id="order-form" onSubmit={submit}>
        <ErrorNote error={err} />
        <div className="form-grid">
          {isSales ? (
            <Field label={tr('النوع', 'Type')} className="col-3">
              <Select value={kind} onChange={(e) => setKind(e.target.value as 'QUOTATION' | 'ORDER')}>
                <option value="QUOTATION">{tr('عرض سعر', 'Quotation')}</option>
                <option value="ORDER">{tr('أمر بيع', 'Sales order')}</option>
              </Select>
            </Field>
          ) : null}
          <Field label={isSales ? tr('العميل', 'Customer') : tr('المورد', 'Supplier')} required className="col-5">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">{tr('اختر…', 'Select…')}</option>
              {parties.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label={tr('المخزن', 'Warehouse')} required className="col-4">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">{tr('اختر…', 'Select…')}</option>
              {warehouses.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label={tr('التاريخ', 'Date')} required className="col-3"><Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={isSales ? tr('ساري حتى', 'Valid until') : tr('تاريخ التسليم المتوقع', 'Expected delivery')} className="col-3"><Input type="date" dir="ltr" min={date} value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          <Field label={tr('ملاحظات', 'Note')} className="col-6"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="table-wrap mt-16">
          <table className="table">
            <thead><tr><th>{tr('الصنف', 'Product')}</th><th>{tr('الوحدة', 'Unit')}</th><th>{tr('الكمية', 'Qty')}</th><th>{tr('السعر', 'Price')}</th><th>{tr('الإجمالي', 'Total')}</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td><ProductPicker value={l.product} onPick={(p) => patch(l.key, { product: p, unitId: p?.baseUnitId ?? '', price: '', touched: false })} /></td>
                  <td>
                    <Select value={l.unitId} disabled={!l.product} onChange={(e) => patch(l.key, { unitId: e.target.value, touched: false })}>
                      {l.product ? <option value={l.product.baseUnitId}>{lang === 'ar' ? l.product.baseUnit?.nameAr : l.product.baseUnit?.nameEn}</option> : null}
                      {(l.product?.units ?? []).filter((u) => u.unitId !== l.product!.baseUnitId).map((u) => <option key={u.unitId} value={u.unitId}>{lang === 'ar' ? u.unit?.nameAr : u.unit?.nameEn}</option>)}
                    </Select>
                  </td>
                  <td><Input type="number" min="0" step="0.0001" dir="ltr" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} /></td>
                  <td><Input type="number" min="0" step="0.0001" dir="ltr" value={l.touched ? l.price : defaultPrice(l) ? defaultPrice(l).toFixed(2) : ''} onChange={(e) => patch(l.key, { price: e.target.value, touched: true })} /></td>
                  <td><Money value={(Number(l.qty || 0) * priceOf(l)).toFixed(2)} /></td>
                  <td>{lines.length > 1 ? <IconButton icon="x" title={tr('حذف', 'Remove')} danger onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}><Button type="button" variant="ghost" icon="plus" onClick={() => setLines((ls) => [...ls, blank()])}>{tr('بند', 'Add line')}</Button></div>
      </form>
    </Modal>
  );
}

function OrderDetail({ side, id, label, tone, onClose }: { side: Side; id: string; label: (s: string) => string; tone: (s: string) => 'ok' | 'warn' | 'danger'; onClose: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const me = useMe();
  const isSales = side === 'sales';
  const { data, error, loading, reload } = useApi<OrderFull>(`${side}/orders/${id}`);
  const [fulfil, setFulfil] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [paymentKind, setPaymentKind] = useState<'CASH' | 'CREDIT'>('CASH');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doneOf = (p?: OrderFull['progress'][number]) => Number((isSales ? p?.invoiced : p?.received) ?? 0);
  const remainingOf = (productId: string) => Number(data?.progress.find((p) => p.productId === productId)?.remaining ?? 0);
  const factorOf = (l: OrderLine) => Number(l.baseQty) / Number(l.enteredQty);
  const openState = data ? data.status === 'OPEN' || data.status === 'PARTIALLY_INVOICED' || data.status === 'PARTIALLY_RECEIVED' : false;
  const canFulfil = data && openState && (!isSales || data.kind === 'ORDER');
  const defaultQty = (l: OrderLine) => String(Math.round((remainingOf(l.productId) / factorOf(l)) * 10000) / 10000);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr(null);
    try { await fn(); toast.success(ok); setFulfil(false); setQtys({}); reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function confirmQuotation() {
    const ok = await confirm({ title: tr('تأكيد كأمر بيع', 'Confirm as sales order'), message: tr('سيتحول العرض إلى أمر بيع يمكن تنفيذه بفاتورة.', 'The quotation becomes a sales order that can be invoiced.'), confirmLabel: tr('تأكيد', 'Confirm') });
    if (ok) await run(() => post(`sales/orders/${id}/confirm`), tr('تم التأكيد', 'Confirmed'));
  }

  async function cancel() {
    const ok = await confirm({ title: tr('إلغاء المستند', 'Cancel document'), message: tr('لا يمكن التراجع. لا يتأثر المخزون أو الحسابات.', 'This cannot be undone. Stock and accounts are not affected.'), confirmLabel: tr('إلغاء', 'Cancel'), danger: true });
    if (ok) await run(() => post(`${side}/orders/${id}/cancel`, { reason: tr('إلغاء من المستخدم', 'Cancelled by user') }), tr('تم الإلغاء', 'Cancelled'));
  }

  async function submitFulfil() {
    if (!data) return;
    const picked = data.lines.filter((l) => Number(qtys[l.id] ?? defaultQty(l)) > 0);
    if (picked.length === 0) { setErr(tr('أدخل كمية لبند واحد على الأقل', 'Enter a quantity for at least one line')); return; }
    const whId = (data as unknown as { warehouseId: string }).warehouseId;
    const partyId = isSales ? (data as unknown as { customerId: string }).customerId : (data as unknown as { supplierId: string }).supplierId;
    await run(() => post(`${side}/invoices`, {
      idempotencyKey: uuid(), invoiceDate: today(), paymentKind, warehouseId: whId,
      ...(isSales ? { customerId: partyId, salesOrderId: id } : { supplierId: partyId, purchaseOrderId: id }),
      lines: picked.map((l) => ({ productId: l.productId, quantity: qtys[l.id] ?? defaultQty(l), ...(l.unitId ? { unitId: l.unitId } : {}), unitPrice: l.unitPrice })),
    }), isSales ? tr('تم إصدار الفاتورة', 'Invoice issued') : tr('تم تسجيل الاستلام', 'Receipt recorded'));
  }

  return (
    <Modal open onClose={onClose} size="xl" title={data ? `${isSales ? (data.kind === 'ORDER' ? tr('أمر بيع', 'Sales order') : tr('عرض سعر', 'Quotation')) : tr('أمر شراء', 'Purchase order')} #${data.number}` : '…'}
      subtitle={data ? `${(data.customer ?? data.supplier)?.nameAr} — ${lang === 'ar' ? data.warehouse.nameAr : data.warehouse.nameEn}` : undefined}
      footer={data && openState ? (
        <>
          {can(me, `${side}:cancel`) && data.status === 'OPEN' ? <Button variant="ghost" loading={busy} onClick={cancel}>{tr('إلغاء', 'Cancel')}</Button> : null}
          {isSales && data.kind === 'QUOTATION' && can(me, 'sales:create') ? <Button loading={busy} onClick={confirmQuotation}>{tr('تأكيد كأمر بيع', 'Confirm as order')}</Button> : null}
          {canFulfil && can(me, `${side}:create`) ? (fulfil
            ? <Button loading={busy} onClick={submitFulfil}>{isSales ? tr('إصدار الفاتورة', 'Issue invoice') : tr('تسجيل الاستلام', 'Record receipt')}</Button>
            : <Button onClick={() => setFulfil(true)}>{isSales ? tr('تنفيذ بفاتورة', 'Invoice') : tr('استلام بضاعة', 'Receive goods')}</Button>) : null}
        </>
      ) : undefined}>
      <ErrorNote error={err ?? error} />
      {loading && !data ? <Loading /> : data ? (
        <>
          <div style={{ marginBottom: 8 }}><Badge tone={tone(data.status)}>{label(data.status)}</Badge></div>
          {fulfil ? (
            <div style={{ marginBottom: 12 }}>
              <Field label={tr('طريقة الدفع', 'Payment')} className="col-3">
                <Select value={paymentKind} onChange={(e) => setPaymentKind(e.target.value as 'CASH' | 'CREDIT')}>
                  <option value="CASH">{tr('نقدي', 'Cash')}</option>
                  <option value="CREDIT">{tr('آجل', 'Credit')}</option>
                </Select>
              </Field>
              <div className="hint">{tr('الكميات المقترحة هي المتبقي من الأمر. لا يمكن تجاوزه.', 'Suggested quantities are what is left on the order; it cannot be exceeded.')}</div>
            </div>
          ) : null}
          <DataTable<OrderLine>
            rows={data.lines}
            rowKey={(l) => l.id}
            columns={[
              { key: 'c', header: tr('الكود', 'Code'), width: '110px', render: (l) => <span className="tree-code">{l.product.code}</span> },
              { key: 'n', header: tr('الصنف', 'Product'), render: (l) => (lang === 'ar' ? l.product.nameAr : l.product.nameEn) },
              { key: 'q', header: tr('المطلوب', 'Ordered'), align: 'end', render: (l) => <Qty value={l.enteredQty} /> },
              { key: 'p', header: tr('السعر', 'Price'), align: 'end', render: (l) => <Money value={l.unitPrice} /> },
              { key: 'd', header: isSales ? tr('المنفّذ (أساسية)', 'Invoiced (base)') : tr('المستلم (أساسية)', 'Received (base)'), align: 'end', render: (l) => <Qty value={String(doneOf(data.progress.find((p) => p.productId === l.productId)))} /> },
              { key: 'r', header: tr('المتبقي (أساسية)', 'Remaining (base)'), align: 'end', render: (l) => <Qty value={String(remainingOf(l.productId))} /> },
              ...(fulfil ? [{ key: 'x', header: tr('الكمية الآن', 'Quantity now'), width: '130px', render: (l: OrderLine) => <Input type="number" min="0" step="0.0001" dir="ltr" value={qtys[l.id] ?? defaultQty(l)} onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })} /> }] : []),
            ]}
          />
          {data.invoices.length ? (
            <div className="mt-16">
              <div className="section-title">{tr('الفواتير المرتبطة', 'Linked invoices')}</div>
              {data.invoices.map((i) => <div key={i.id}>#{i.number} — <DateText value={i.invoiceDate} /> — <Money value={i.total} /> {i.status === 'CANCELLED' ? <Badge tone="danger">{tr('ملغاة', 'Cancelled')}</Badge> : null}</div>)}
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
