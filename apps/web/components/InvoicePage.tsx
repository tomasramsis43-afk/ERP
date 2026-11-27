'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp, useToast } from '@/components/Providers';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DateText,
  DetailGrid,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Loading,
  Modal,
  Money,
  PageHeader,
  Pagination,
  Qty,
  Select,
  SummaryStrip,
  Tabs,
  Textarea,
} from '@/components/ui';
import { useApi, useDebounced, usePaged, useMe, can } from '@/lib/hooks';
import { get, post, uuid } from '@/lib/api';
import { queryString, today } from '@/lib/format';
import { ProductPicker, ProductLite } from './ProductPicker';

type Side = 'sales' | 'purchases';

interface PartyRef { code: string; nameAr: string }
interface InvoiceLine {
  id: string;
  productId: string;
  unitId: string | null;
  enteredQty: string;
  baseQty: string;
  unitPrice: string;
  discount: string;
  lineNet: string;
  unitCost: string;
}
interface Invoice {
  id: string;
  number: number;
  kind: 'SALE' | 'PURCHASE' | 'RETURN';
  invoiceDate: string;
  paymentKind: 'CASH' | 'CREDIT';
  status: 'POSTED' | 'CANCELLED';
  subtotal: string;
  discountTotal: string;
  vatTotal: string;
  total: string;
  shippingCost?: string;
  note: string | null;
  cancelReason?: string | null;
  customer?: PartyRef | null;
  supplier?: PartyRef | null;
  lines?: InvoiceLine[];
  representativeId?: string | null;
  warehouseId?: string;
}

interface Option { id: string; nameAr: string; nameEn?: string; code?: string }

export function InvoicePage({ side }: { side: Side }) {
  const { tr, lang } = useApp();
  const me = useMe();
  const isSales = side === 'sales';
  const [tab, setTab] = useState<'main' | 'return'>('main');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partyId, setPartyId] = useState('');
  const [creating, setCreating] = useState<'SALE' | 'RETURN' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const parties = useApi<{ items: Option[] }>(`${isSales ? 'customers' : 'suppliers'}?pageSize=100`);
  const kind = tab === 'main' ? (isSales ? 'SALE' : 'PURCHASE') : 'RETURN';

  const path = useMemo(
    () =>
      `${side}/invoices${queryString({
        page,
        pageSize,
        kind,
        status,
        from,
        to,
        ...(isSales ? { customerId: partyId } : { supplierId: partyId }),
      })}`,
    [side, page, pageSize, kind, status, from, to, partyId, isSales],
  );
  const { data, error, loading, reload } = usePaged<Invoice>(path);
  useEffect(() => setPage(1), [tab, status, from, to, partyId]);
  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey]); // eslint-disable-line

  function changed() {
    setCreating(null);
    setDetailId(null);
    setRefreshKey((n) => n + 1);
  }

  return (
    <>
      <PageHeader
        title={isSales ? tr('المبيعات', 'Sales') : tr('المشتريات', 'Purchases')}
        sub={
          isSales
            ? tr('فواتير البيع والمرتجعات مع الترحيل المحاسبي التلقائي', 'Sales invoices and returns with automatic posting')
            : tr('فواتير الشراء والمرتجعات وتكلفة المخزون', 'Purchase invoices, returns and landed cost')
        }
      >
        <Button icon="plus" onClick={() => setCreating('SALE')}>
          {isSales ? tr('فاتورة بيع', 'Sales invoice') : tr('فاتورة شراء', 'Purchase invoice')}
        </Button>
        <Link href={`/${side}/orders`} className="btn ghost">{isSales ? tr('عروض وأوامر البيع', 'Quotes & orders') : tr('أوامر الشراء', 'Purchase orders')}</Link>
        <Button variant="ghost" icon="transfer" onClick={() => setCreating('RETURN')}>
          {tr('مرتجع', 'Return')}
        </Button>
      </PageHeader>

      <Card>
        <div style={{ padding: '0 16px' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'main', label: isSales ? tr('فواتير البيع', 'Sales invoices') : tr('فواتير الشراء', 'Purchase invoices') },
              { id: 'return', label: tr('المرتجعات', 'Returns') },
            ]}
          />
        </div>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} style={{ width: 'auto', minWidth: 190 }}>
            <option value="">{isSales ? tr('كل العملاء', 'All customers') : tr('كل الموردين', 'All suppliers')}</option>
            {(parties.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.nameAr}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="POSTED">{tr('مرحّل', 'Posted')}</option>
            <option value="CANCELLED">{tr('ملغي', 'Cancelled')}</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <div className="spacer" />
          {data ? (
            <span className="muted">
              {tr('الإجمالي', 'Total')}: <Money value={data.items.filter((i) => i.status === 'POSTED').reduce((a, i) => a + Number(i.total), 0).toFixed(2)} bold />
            </span>
          ) : null}
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<Invoice>
              rows={data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailId(r.id)}
              columns={[
                { key: 'number', header: tr('رقم المستند', 'Document'), width: '110px', render: (r) => <span className="mono fw-600">#{r.number}</span> },
                { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.invoiceDate} />, width: '110px' },
                {
                  key: 'party',
                  header: isSales ? tr('العميل', 'Customer') : tr('المورد', 'Supplier'),
                  render: (r) => {
                    const p = isSales ? r.customer : r.supplier;
                    return p ? (
                      <div>
                        <div className="fw-600">{p.nameAr}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{p.code}</div>
                      </div>
                    ) : <span className="muted">{tr('بيع نقدي', 'Cash sale')}</span>;
                  },
                },
                {
                  key: 'pay',
                  header: tr('السداد', 'Payment'),
                  render: (r) => (r.paymentKind === 'CASH' ? <Badge tone="ok">{tr('نقدي', 'Cash')}</Badge> : <Badge tone="warn">{tr('آجل', 'Credit')}</Badge>),
                },
                { key: 'total', header: tr('الإجمالي', 'Total'), align: 'end', render: (r) => <Money value={r.total} bold /> },
                {
                  key: 'status',
                  header: tr('الحالة', 'Status'),
                  align: 'center',
                  render: (r) =>
                    r.status === 'POSTED' ? <Badge tone="ok">{tr('مرحّل', 'Posted')}</Badge> : <Badge tone="danger">{tr('ملغي', 'Cancelled')}</Badge>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => (
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'POSTED' && can(me, `${side}:cancel`) ? (
                        <IconButton icon="x" danger title={tr('إلغاء المستند', 'Cancel document')} onClick={() => setCancelTarget(r)} />
                      ) : null}
                    </div>
                  ),
                },
              ]}
              empty={<EmptyState title={tr('لا توجد مستندات', 'No documents')} sub={tr('أنشئ أول فاتورة', 'Create your first invoice')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <InvoiceForm
        side={side}
        kind={creating === 'RETURN' ? 'RETURN' : isSales ? 'SALE' : 'PURCHASE'}
        open={Boolean(creating)}
        onClose={() => setCreating(null)}
        onSaved={changed}
      />

      {detailId ? (
        <InvoiceDetailModal side={side} id={detailId} onClose={() => setDetailId(null)} onChanged={changed} />
      ) : null}

      <CancelModal
        side={side}
        invoice={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={changed}
      />
    </>
  );
}

/* ------------------------------------------------------------------ form */

interface DraftLine {
  key: string;
  product: ProductLite | null;
  unitId: string;
  qty: string;
  price: string;
  priceTouched: boolean;
  discount: string;
}

function emptyLine(): DraftLine {
  return { key: uuid(), product: null, unitId: '', qty: '1', price: '', priceTouched: false, discount: '0' };
}

function InvoiceForm({
  side,
  kind,
  open,
  onClose,
  onSaved,
}: {
  side: Side;
  kind: 'SALE' | 'PURCHASE' | 'RETURN';
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const me = useMe();
  const isSales = side === 'sales';
  const isReturn = kind === 'RETURN';

  const parties = useApi<{ items: Option[] }>(`${isSales ? 'customers' : 'suppliers'}?pageSize=100`);
  const warehouses = useApi<Option[]>('warehouses');
  const reps = useApi<{ items: Option[] }>(isSales ? 'representatives?pageSize=100' : null);
  const [repDetail, setRepDetail] = useState<{ vehicle?: { warehouseId: string } | null } | null>(null);

  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentKind, setPaymentKind] = useState<'CASH' | 'CREDIT'>('CASH');
  const [priceList, setPriceList] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [representativeId, setRepresentativeId] = useState('');
  const [note, setNote] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [condition, setCondition] = useState<'GOOD' | 'DAMAGED'>('GOOD');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(today());
    setPartyId('');
    setWarehouseId('');
    setPaymentKind('CASH');
    setPriceList('RETAIL');
    setRepresentativeId('');
    setNote('');
    setSupplierRef('');
    setShippingCost('');
    setOriginalInvoiceId('');
    setCondition('GOOD');
    setLines([emptyLine()]);
    setError(null);
    setRepDetail(null);
  }, [open]);

  useEffect(() => {
    if (!representativeId) {
      setRepDetail(null);
      return;
    }
    let stale = false;
    get<{ vehicle?: { warehouseId: string } | null }>(`representatives/${representativeId}`)
      .then((r) => {
        if (stale) return;
        setRepDetail(r);
        if (r.vehicle?.warehouseId) setWarehouseId(r.vehicle.warehouseId);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [representativeId]);

  const defaultPrice = (line: DraftLine): number => {
    if (!line.product) return 0;
    const factor = factorOf(line);
    const base = isSales
      ? Number(priceList === 'WHOLESALE' ? line.product.wholesalePrice : line.product.retailPrice)
      : Number(line.product.purchasePrice);
    return base * factor;
  };
  const factorOf = (line: DraftLine): number => {
    if (!line.product) return 1;
    if (!line.unitId || line.unitId === line.product.baseUnitId) return 1;
    const u = line.product.units?.find((x) => x.unitId === line.unitId);
    return u ? Number(u.factor) : 1;
  };
  const priceOf = (line: DraftLine): number => (line.priceTouched ? Number(line.price || 0) : defaultPrice(line));
  const lineTotal = (line: DraftLine) => Math.max(0, Number(line.qty || 0) * priceOf(line) - (isSales ? Number(line.discount || 0) : 0));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.qty || 0) * priceOf(l), 0);
    const discount = isSales ? lines.reduce((a, l) => a + Number(l.discount || 0), 0) : 0;
    return { subtotal, discount, total: subtotal - discount };
  }, [lines, priceList, isSales]); // eslint-disable-line

  function setLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: string, p: ProductLite | null) {
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? { ...l, product: p, unitId: p?.baseUnitId ?? '', price: '', priceTouched: false }
          : l,
      ),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const valid = lines.filter((l) => l.product && Number(l.qty) > 0);
      if (valid.length === 0) throw new Error(tr('أضف صنفًا واحدًا على الأقل', 'Add at least one product'));
      if (!warehouseId) throw new Error(tr('اختر المخزن', 'Choose a warehouse'));
      if (!isSales && !partyId) throw new Error(tr('اختر المورد', 'Choose a supplier'));
      const payload: Record<string, unknown> = {
        idempotencyKey: uuid(),
        invoiceDate: date,
        paymentKind,
        warehouseId,
        note: note || undefined,
        lines: valid.map((l) => ({
          productId: l.product!.id,
          quantity: l.qty,
          ...(l.unitId && l.unitId !== l.product!.baseUnitId ? { unitId: l.unitId } : {}),
          ...(isSales
            ? {
                ...(l.priceTouched ? { unitPrice: l.price } : {}),
                ...(Number(l.discount) > 0 ? { discount: l.discount } : {}),
              }
            : { unitPrice: priceOf(l).toFixed(4) }),
        })),
      };
      if (isSales) {
        if (partyId) payload.customerId = partyId;
        if (representativeId) payload.representativeId = representativeId;
        payload.priceList = priceList;
        if (isReturn) {
          if (originalInvoiceId) payload.originalInvoiceId = originalInvoiceId;
          payload.condition = condition;
        }
      } else {
        payload.supplierId = partyId;
        if (supplierRef) payload.supplierRef = supplierRef;
        if (!isReturn && shippingCost) payload.shippingCost = shippingCost;
      }
      const endpoint = isReturn ? `${side}/returns` : `${side}/invoices`;
      const saved = await post<Invoice>(endpoint, payload);
      toast.success(`${tr('تم حفظ المستند', 'Document saved')} #${saved.number} · ${saved.total}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const warehouseOptions = warehouses.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isReturn
          ? tr('مرتجع جديد', 'New return')
          : isSales
            ? tr('فاتورة بيع جديدة', 'New sales invoice')
            : tr('فاتورة شراء جديدة', 'New purchase invoice')
      }
      size="xl"
      footer={
        <>
          <div style={{ marginInlineEnd: 'auto', fontWeight: 700 }}>
            {tr('الإجمالي', 'Total')}: <Money value={totals.total.toFixed(2)} bold />
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="invoice-form" loading={busy} icon="save">{tr('حفظ وترحيل', 'Save & post')}</Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('التاريخ', 'Date')} required className="col-3">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required dir="ltr" />
          </Field>
          <Field label={isSales ? tr('العميل', 'Customer') : tr('المورد', 'Supplier')} required={!isSales || paymentKind === 'CREDIT'} className="col-5">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} required={!isSales || paymentKind === 'CREDIT'}>
              <option value="">{isSales ? tr('بيع نقدي بدون عميل', 'Cash sale without customer') : '—'}</option>
              {(parties.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.nameAr}</option>
              ))}
            </Select>
          </Field>
          <Field label={tr('المخزن', 'Warehouse')} required className="col-4">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">—</option>
              {warehouseOptions.map((w) => (
                <option key={w.id} value={w.id}>{w.code} · {lang === 'ar' ? w.nameAr : w.nameEn}</option>
              ))}
            </Select>
          </Field>

          <Field label={tr('طريقة السداد', 'Payment')} className="col-3">
            <Select value={paymentKind} onChange={(e) => setPaymentKind(e.target.value as 'CASH' | 'CREDIT')}>
              <option value="CASH">{tr('نقدي', 'Cash')}</option>
              <option value="CREDIT" disabled={!isSales || !can(me, 'sales:credit_sale')}>{tr('آجل', 'Credit')}</option>
            </Select>
          </Field>

          {isSales ? (
            <>
              <Field label={tr('قائمة الأسعار', 'Price list')} className="col-3">
                <Select value={priceList} onChange={(e) => setPriceList(e.target.value as 'RETAIL' | 'WHOLESALE')}>
                  <option value="RETAIL">{tr('قطاعي', 'Retail')}</option>
                  <option value="WHOLESALE">{tr('جملة', 'Wholesale')}</option>
                </Select>
              </Field>
              <Field label={tr('المندوب', 'Representative')} className="col-3">
                <Select value={representativeId} onChange={(e) => setRepresentativeId(e.target.value)}>
                  <option value="">—</option>
                  {(reps.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ''}{r.nameAr}</option>)}
                </Select>
              </Field>
              <Field label={tr('مرجع المستند', 'Reference')} className="col-3">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('ملاحظات…', 'Notes…')} />
              </Field>
            </>
          ) : (
            <>
              <Field label={tr('مرجع المورد', 'Supplier reference')} className="col-3">
                <Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
              </Field>
              <Field label={tr('مصاريف الشحن', 'Shipping cost')} className="col-3">
                <Input type="number" min="0" step="0.01" dir="ltr" value={shippingCost} disabled={isReturn} onChange={(e) => setShippingCost(e.target.value)} />
              </Field>
              <Field label={tr('ملاحظات', 'Notes')} className="col-3">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}

          {isReturn ? (
            <>
              <Field label={tr('الفاتورة الأصلية', 'Original invoice')} className="col-4">
                <Input value={originalInvoiceId} onChange={(e) => setOriginalInvoiceId(e.target.value)} placeholder={tr('رقم الفاتورة (اختياري)', 'Invoice id (optional)')} dir="ltr" />
              </Field>
              <Field label={tr('حالة البضاعة', 'Condition')} className="col-4">
                <Select value={condition} onChange={(e) => setCondition(e.target.value as 'GOOD' | 'DAMAGED')}>
                  <option value="GOOD">{tr('سليمة', 'Good')}</option>
                  <option value="DAMAGED">{tr('تالفة', 'Damaged')}</option>
                </Select>
              </Field>
            </>
          ) : null}
        </div>

        {representativeId && !repDetail?.vehicle ? (
          <div className="mt-8"><ErrorNote error={tr('هذا المندوب ليس له سيارة/مخزن عهدة', 'This representative has no vehicle warehouse')} /></div>
        ) : null}

        <div className="section-title mt-16">{tr('بنود المستند', 'Document lines')}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>{tr('الصنف', 'Product')}</th>
                <th style={{ width: 120 }}>{tr('الوحدة', 'Unit')}</th>
                <th style={{ width: 100 }}>{tr('الكمية', 'Qty')}</th>
                <th style={{ width: 120 }}>{tr('السعر', 'Price')}</th>
                {isSales ? <th style={{ width: 110 }}>{tr('خصم', 'Discount')}</th> : null}
                <th style={{ width: 120 }}>{tr('الإجمالي', 'Total')}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td>
                    <ProductPicker
                      value={line.product}
                      onPick={(p) => pickProduct(line.key, p)}
                    />
                  </td>
                  <td>
                    <Select
                      value={line.unitId}
                      disabled={!line.product}
                      onChange={(e) => setLine(line.key, { unitId: e.target.value, priceTouched: false })}
                    >
                      {line.product ? (
                        <>
                          <option value={line.product.baseUnitId}>
                            {line.product.baseUnit ? (lang === 'ar' ? line.product.baseUnit.nameAr : line.product.baseUnit.nameEn) : tr('أساسية', 'Base')}
                          </option>
                          {(line.product.units ?? []).map((u) => (
                            <option key={u.unitId} value={u.unitId}>
                              {u.unit ? (lang === 'ar' ? u.unit.nameAr : u.unit.nameEn) : u.unitId} ×{u.factor}
                            </option>
                          ))}
                        </>
                      ) : <option value="">—</option>}
                    </Select>
                  </td>
                  <td>
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      dir="ltr"
                      value={line.qty}
                      onChange={(e) => setLine(line.key, { qty: e.target.value })}
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      dir="ltr"
                      value={line.priceTouched ? line.price : line.product ? defaultPrice(line).toFixed(2) : ''}
                      disabled={!line.product || (isSales && !can(me, 'sales:edit_price'))}
                      onChange={(e) => setLine(line.key, { price: e.target.value, priceTouched: true })}
                    />
                  </td>
                  {isSales ? (
                    <td>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={line.discount}
                        disabled={!can(me, 'sales:discount')}
                        onChange={(e) => setLine(line.key, { discount: e.target.value })}
                      />
                    </td>
                  ) : null}
                  <td><Money value={lineTotal(line).toFixed(2)} bold /></td>
                  <td>
                    <IconButton
                      icon="trash"
                      danger
                      title={tr('حذف البند', 'Remove line')}
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" icon="plus" type="button" className="mt-8" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          {tr('إضافة بند', 'Add line')}
        </Button>

        <SummaryStrip
          items={[
            { label: tr('الإجمالي قبل الخصم', 'Subtotal'), value: <Money value={totals.subtotal.toFixed(2)} /> },
            ...(isSales ? [{ label: tr('الخصومات', 'Discounts'), value: <Money value={totals.discount.toFixed(2)} /> }] : []),
            ...(!isSales && shippingCost ? [{ label: tr('الشحن', 'Shipping'), value: <Money value={shippingCost} /> }] : []),
            { label: tr('الصافي', 'Net'), value: <Money value={totals.total.toFixed(2)} bold /> },
          ]}
        />
        <div className="hint mt-8">{tr('يُحسب ضريبة القيمة المضافة تلقائيًا حسب إعدادات النظام عند الترحيل.', 'VAT is applied automatically from system settings on posting.')}</div>

        {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- detail */

function InvoiceDetailModal({ side, id, onClose, onChanged }: { side: Side; id: string; onClose: () => void; onChanged: () => void }) {
  const { tr, lang } = useApp();
  const me = useMe();
  const { data, error, loading } = useApi<Invoice>(`${side}/invoices/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const isSales = side === 'sales';
  const party = data ? (isSales ? data.customer : data.supplier) : null;

  return (
    <Modal open onClose={onClose} title={data ? `${tr('مستند', 'Document')} #${data.number}` : tr('مستند', 'Document')} size="xl"
      footer={
        <>
          <Button variant="ghost" icon="print" onClick={() => window.print()}>{tr('طباعة', 'Print')}</Button>
          {data && data.status === 'POSTED' && can(me, `${side}:cancel`) ? (
            <Button variant="danger" icon="x" onClick={() => setCancelling(true)}>{tr('إلغاء المستند', 'Cancel document')}</Button>
          ) : null}
        </>
      }
    >
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <div>
          <DetailGrid
            items={[
              { label: tr('النوع', 'Type'), value: data.kind === 'RETURN' ? tr('مرتجع', 'Return') : isSales ? tr('فاتورة بيع', 'Sales invoice') : tr('فاتورة شراء', 'Purchase invoice') },
              { label: tr('التاريخ', 'Date'), value: <DateText value={data.invoiceDate} /> },
              { label: isSales ? tr('العميل', 'Customer') : tr('المورد', 'Supplier'), value: party ? `${party.code} · ${party.nameAr}` : '—' },
              { label: tr('السداد', 'Payment'), value: data.paymentKind === 'CASH' ? tr('نقدي', 'Cash') : tr('آجل', 'Credit') },
              { label: tr('الحالة', 'Status'), value: data.status === 'POSTED' ? <Badge tone="ok">{tr('مرحّل', 'Posted')}</Badge> : <Badge tone="danger">{tr('ملغي', 'Cancelled')}</Badge> },
              { label: tr('ملاحظات', 'Notes'), value: data.note || '—' },
              ...(data.cancelReason ? [{ label: tr('سبب الإلغاء', 'Cancel reason'), value: data.cancelReason }] : []),
            ]}
          />
          <div className="table-wrap mt-16">
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('الصنف', 'Product')}</th>
                  <th>{tr('الكمية', 'Qty')}</th>
                  <th>{tr('السعر', 'Price')}</th>
                  {isSales ? <th>{tr('الخصم', 'Discount')}</th> : null}
                  <th style={{ textAlign: 'end' }}>{tr('الصافي', 'Net')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td><span className="mono">{l.productId.slice(0, 8)}</span></td>
                    <td><Qty value={l.enteredQty} /></td>
                    <td><Money value={l.unitPrice} /></td>
                    {isSales ? <td><Money value={l.discount} /></td> : null}
                    <td style={{ textAlign: 'end' }}><Money value={l.lineNet} bold /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SummaryStrip
            items={[
              { label: tr('قبل الخصم', 'Subtotal'), value: <Money value={data.subtotal} /> },
              ...(isSales ? [{ label: tr('الخصم', 'Discount'), value: <Money value={data.discountTotal} /> }] : []),
              { label: tr('الضريبة', 'VAT'), value: <Money value={data.vatTotal} /> },
              ...(!isSales && data.shippingCost ? [{ label: tr('الشحن', 'Shipping'), value: <Money value={data.shippingCost} /> }] : []),
              { label: tr('الإجمالي', 'Total'), value: <Money value={data.total} bold /> },
            ]}
          />
        </div>
      ) : null}

      <CancelModal side={side} invoice={cancelling && data ? data : null} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); onChanged(); }} />
    </Modal>
  );
}

/* --------------------------------------------------------------- cancel */

function CancelModal({ side, invoice, onClose, onDone }: { side: Side; invoice: Invoice | null; onClose: () => void; onDone: () => void }) {
  const { tr } = useApp();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setReason(''), [invoice]);
  if (!invoice) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await post(`${side}/invoices/${invoice!.id}/cancel`, { reason });
      toast.success(tr('تم إلغاء المستند وعكس القيد', 'Document cancelled and entry reversed'));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${tr('إلغاء المستند', 'Cancel document')} #${invoice.number}`} subtitle={tr('سيتم عكس القيد المحاسبي وإرجاع المخزون', 'The journal entry will be reversed and stock returned')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tr('تراجع', 'Back')}</Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={submit}>{tr('تأكيد الإلغاء', 'Confirm cancel')}</Button>
        </>
      }
    >
      <Field label={tr('سبب الإلغاء', 'Reason')} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('اكتب سبب الإلغاء (3 أحرف على الأقل)…', 'Reason (at least 3 characters)…')} />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}
