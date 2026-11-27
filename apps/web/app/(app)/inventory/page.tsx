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
  Tabs,
  Textarea,
} from '@/components/ui';
import { ProductPicker, ProductLite } from '@/components/ProductPicker';
import { useApi, usePaged } from '@/lib/hooks';
import { post, uuid } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface Warehouse { id: string; code: string; nameAr: string; nameEn: string; type: string }
interface Balance {
  warehouseId: string;
  productId: string;
  quantity: string;
  product: { code: string; nameAr: string; nameEn: string; reorderLevel?: string; avgCost?: string };
  warehouse: { code: string; nameAr?: string };
}
interface Movement {
  id: string;
  number: number;
  type: string;
  movementDate: string;
  quantity: string;
  unitCost: string;
  source: string;
  note: string | null;
  product: { code: string; nameAr: string; nameEn: string };
  warehouse: { code: string; nameAr: string; nameEn: string };
}

const MOVE_LABEL: Record<string, [string, string, 'ok' | 'warn' | 'info' | 'danger']> = {
  OPENING: ['رصيد افتتاحي', 'Opening', 'info'],
  PURCHASE_IN: ['شراء', 'Purchase in', 'ok'],
  PURCHASE_RETURN_OUT: ['مرتجع شراء', 'Purchase return', 'warn'],
  SALE_OUT: ['بيع', 'Sale out', 'warn'],
  SALE_RETURN_IN: ['مرتجع بيع', 'Sales return', 'ok'],
  TRANSFER_OUT: ['تحويل صادر', 'Transfer out', 'info'],
  TRANSFER_IN: ['تحويل وارد', 'Transfer in', 'info'],
  ADJUSTMENT_IN: ['تسوية إضافة', 'Adjustment in', 'ok'],
  ADJUSTMENT_OUT: ['تسوية خصم', 'Adjustment out', 'danger'],
};

export default function InventoryPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'balances' | 'movements'>('balances');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [warehouseId, setWarehouseId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [op, setOp] = useState<'transfer' | 'opening' | 'adjustment' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const warehouses = useApi<Warehouse[]>('warehouses');

  const balancesPath = useMemo(
    () => `inventory/balances${queryString({ page, pageSize, warehouseId, lowOnly: lowOnly ? 'true' : undefined })}`,
    [page, pageSize, warehouseId, lowOnly],
  );
  const movementsPath = useMemo(
    () => `inventory/movements${queryString({ page, pageSize, warehouseId, from, to })}`,
    [page, pageSize, warehouseId, from, to],
  );
  const balances = usePaged<Balance>(tab === 'balances' ? balancesPath : null);
  const movements = usePaged<Movement>(tab === 'movements' ? movementsPath : null);

  useEffect(() => setPage(1), [tab, warehouseId, lowOnly, from, to]);
  useEffect(() => {
    if (refreshKey) {
      balances.reload();
      movements.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const whName = (w: Warehouse) => `${w.code} · ${lang === 'ar' ? w.nameAr : w.nameEn}`;

  return (
    <>
      <PageHeader title={tr('المخزون', 'Inventory')} sub={tr('أرصدة المخازن وحركة الأصناف والتحويلات والتسويات', 'Stock balances, movements, transfers and adjustments')}>
        <Button icon="transfer" onClick={() => setOp('transfer')}>{tr('تحويل مخزون', 'Transfer')}</Button>
        <Button variant="ghost" icon="arrow-down" onClick={() => setOp('opening')}>{tr('رصيد افتتاحي', 'Opening stock')}</Button>
        <Button variant="ghost" icon="edit" onClick={() => setOp('adjustment')}>{tr('تسوية جرد', 'Adjustment')}</Button>
        <Link href="/inventory/counts" className="btn ghost">{tr('الجرد المخزني', 'Stock counts')}</Link>
      </PageHeader>

      <Card>
        <div style={{ padding: '0 16px' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'balances', label: tr('الأرصدة', 'Balances') },
              { id: 'movements', label: tr('حركة المخزون', 'Movements') },
            ]}
          />
        </div>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            <option value="">{tr('كل المخازن', 'All warehouses')}</option>
            {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{whName(w)}</option>)}
          </Select>
          {tab === 'balances' ? (
            <label className="check">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              <span>{tr('تحت حد الطلب فقط', 'Below reorder level only')}</span>
            </label>
          ) : (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
            </>
          )}
        </div>

        {tab === 'balances' ? (
          <>
            <ErrorNote error={balances.error} />
            {balances.loading && !balances.data ? <Loading /> : null}
            {balances.data ? (
              <>
                <DataTable<Balance>
                  rows={balances.data.items}
                  rowKey={(r) => `${r.warehouseId}-${r.productId}`}
                  columns={[
                    { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.product.code}</span> },
                    { key: 'name', header: tr('الصنف', 'Product'), render: (r) => (lang === 'ar' ? r.product.nameAr : r.product.nameEn) },
                    { key: 'wh', header: tr('المخزن', 'Warehouse'), render: (r) => r.warehouse.code },
                    {
                      key: 'qty',
                      header: tr('الكمية', 'Quantity'),
                      align: 'end',
                      render: (r) => {
                        const low = r.product.reorderLevel && Number(r.product.reorderLevel) > 0 && Number(r.quantity) <= Number(r.product.reorderLevel);
                        return (
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <Qty value={r.quantity} />
                            {low ? <Badge tone="danger">{tr('تحت الحد', 'Low')}</Badge> : null}
                          </span>
                        );
                      },
                    },
                    { key: 'cost', header: tr('متوسط التكلفة', 'Avg cost'), align: 'end', render: (r) => <Money value={r.product.avgCost ?? '0'} /> },
                    {
                      key: 'value',
                      header: tr('القيمة', 'Value'),
                      align: 'end',
                      render: (r) => <Money value={(Number(r.quantity) * Number(r.product.avgCost ?? 0)).toFixed(2)} bold />,
                    },
                    { key: 'reorder', header: tr('حد الطلب', 'Reorder'), align: 'end', render: (r) => <Qty value={r.product.reorderLevel ?? '0'} /> },
                  ]}
                  empty={<EmptyState title={tr('لا توجد أرصدة', 'No balances')} sub={tr('أضف رصيدًا افتتاحيًا أو فاتورة شراء', 'Add opening stock or a purchase invoice')} />}
                />
                <Pagination
                  page={balances.data.page ?? page}
                  pageSize={balances.data.pageSize ?? pageSize}
                  total={balances.data.total ?? balances.data.items.length}
                  onPage={setPage}
                  onPageSize={(n) => { setPageSize(n); setPage(1); }}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <ErrorNote error={movements.error} />
            {movements.loading && !movements.data ? <Loading /> : null}
            {movements.data ? (
              <>
                <DataTable<Movement>
                  rows={movements.data.items}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'no', header: '#', width: '80px', render: (r) => <span className="mono">{r.number}</span> },
                    { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.movementDate} />, width: '105px' },
                    {
                      key: 'type',
                      header: tr('الحركة', 'Movement'),
                      render: (r) => {
                        const m = MOVE_LABEL[r.type] ?? [r.type, r.type, 'muted' as const];
                        return <Badge tone={m[2]}>{tr(m[0], m[1])}</Badge>;
                      },
                    },
                    { key: 'product', header: tr('الصنف', 'Product'), render: (r) => `${r.product.code} · ${lang === 'ar' ? r.product.nameAr : r.product.nameEn}` },
                    { key: 'wh', header: tr('المخزن', 'Warehouse'), render: (r) => r.warehouse.code },
                    {
                      key: 'qty',
                      header: tr('الكمية', 'Quantity'),
                      align: 'end',
                      render: (r) => (
                        <span className={Number(r.quantity) < 0 ? 'neg' : ''}>
                          <Qty value={r.quantity} />
                        </span>
                      ),
                    },
                    { key: 'cost', header: tr('التكلفة', 'Unit cost'), align: 'end', render: (r) => <Money value={r.unitCost} /> },
                    { key: 'source', header: tr('المصدر', 'Source'), render: (r) => <span className="muted">{r.source}</span> },
                  ]}
                  empty={<EmptyState title={tr('لا توجد حركات', 'No movements')} />}
                />
                <Pagination
                  page={movements.data.page}
                  pageSize={movements.data.pageSize}
                  total={movements.data.total}
                  onPage={setPage}
                  onPageSize={(n) => { setPageSize(n); setPage(1); }}
                />
              </>
            ) : null}
          </>
        )}
      </Card>

      <StockOpModal
        mode={op}
        warehouses={warehouses.data ?? []}
        onClose={() => setOp(null)}
        onSaved={() => {
          setOp(null);
          setRefreshKey((n) => n + 1);
        }}
      />
    </>
  );
}

interface OpLine { key: string; product: ProductLite | null; qty: string; unitId: string; unitCost: string }

function StockOpModal({
  mode,
  warehouses,
  onClose,
  onSaved,
}: {
  mode: 'transfer' | 'opening' | 'adjustment' | null;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<OpLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setDate(today());
    setFromWarehouseId('');
    setToWarehouseId('');
    setWarehouseId('');
    setDirection('IN');
    setReason('');
    setNote('');
    setLines([{ key: uuid(), product: null, qty: '1', unitId: '', unitCost: '' }]);
    setError(null);
  }, [mode]);

  if (!mode) return null;
  const title = mode === 'transfer' ? tr('تحويل مخزون بين المخازن', 'Transfer between warehouses') : mode === 'opening' ? tr('رصيد افتتاحي', 'Opening stock') : tr('تسوية جرد', 'Stock adjustment');

  function setLine(key: string, patch: Partial<OpLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const valid = lines.filter((l) => l.product && Number(l.qty) > 0);
      if (!valid.length) throw new Error(tr('أضف صنفًا واحدًا على الأقل', 'Add at least one product'));
      const body: Record<string, unknown> = {
        date,
        note: note || undefined,
        idempotencyKey: uuid(),
        lines: valid.map((l) => ({
          productId: l.product!.id,
          quantity: l.qty,
          ...(l.unitId && l.unitId !== l.product!.baseUnitId ? { unitId: l.unitId } : {}),
          ...(mode === 'opening' || l.unitCost ? { unitCost: l.unitCost } : {}),
        })),
      };
      if (mode === 'transfer') {
        body.fromWarehouseId = fromWarehouseId;
        body.toWarehouseId = toWarehouseId;
      } else {
        body.warehouseId = warehouseId;
        if (mode === 'adjustment') {
          body.direction = direction;
          body.reason = reason;
        }
      }
      await post(`inventory/${mode === 'transfer' ? 'transfers' : mode === 'opening' ? 'opening-stock' : 'adjustments'}`, body);
      toast.success(tr('تم تنفيذ العملية وترحيل القيد', 'Operation completed and posted'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="stock-op-form" loading={busy} icon="save">{tr('تنفيذ', 'Apply')}</Button>
        </>
      }
    >
      <form id="stock-op-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('التاريخ', 'Date')} required className="col-3">
            <Input type="date" value={date} required dir="ltr" onChange={(e) => setDate(e.target.value)} />
          </Field>
          {mode === 'transfer' ? (
            <>
              <Field label={tr('من مخزن', 'From warehouse')} required className="col-4">
                <Select value={fromWarehouseId} required onChange={(e) => setFromWarehouseId(e.target.value)}>
                  <option value="">—</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {lang === 'ar' ? w.nameAr : w.nameEn}</option>)}
                </Select>
              </Field>
              <Field label={tr('إلى مخزن', 'To warehouse')} required className="col-4">
                <Select value={toWarehouseId} required onChange={(e) => setToWarehouseId(e.target.value)}>
                  <option value="">—</option>
                  {warehouses.filter((w) => w.id !== fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} · {lang === 'ar' ? w.nameAr : w.nameEn}</option>)}
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label={tr('المخزن', 'Warehouse')} required className="col-4">
                <Select value={warehouseId} required onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">—</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {lang === 'ar' ? w.nameAr : w.nameEn}</option>)}
                </Select>
              </Field>
              {mode === 'adjustment' ? (
                <Field label={tr('الاتجاه', 'Direction')} className="col-3">
                  <Select value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}>
                    <option value="IN">{tr('إضافة للمخزون', 'Increase')}</option>
                    <option value="OUT">{tr('خصم من المخزون', 'Decrease')}</option>
                  </Select>
                </Field>
              ) : null}
            </>
          )}
          <Field label={tr('ملاحظات', 'Notes')} className={mode === 'adjustment' ? 'col-5' : 'col-5'}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {mode === 'adjustment' ? (
            <Field label={tr('سبب التسوية', 'Reason')} required className="col-7">
              <Textarea value={reason} required onChange={(e) => setReason(e.target.value)} placeholder={tr('سبب الجرد أو الفرق…', 'Count difference reason…')} />
            </Field>
          ) : null}
        </div>

        <div className="section-title mt-16">{tr('الأصناف', 'Products')}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>{tr('الصنف', 'Product')}</th>
                <th style={{ width: 130 }}>{tr('الوحدة', 'Unit')}</th>
                <th style={{ width: 110 }}>{tr('الكمية', 'Qty')}</th>
                <th style={{ width: 130 }}>{tr('تكلفة الوحدة', 'Unit cost')}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td>
                    <ProductPicker value={line.product} onPick={(p) => setLine(line.key, { product: p, unitId: p?.baseUnitId ?? '', unitCost: mode === 'opening' && p ? p.purchasePrice : line.unitCost })} />
                  </td>
                  <td>
                    <Select value={line.unitId} disabled={!line.product} onChange={(e) => setLine(line.key, { unitId: e.target.value })}>
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
                    <Input type="number" min="0.0001" step="0.0001" dir="ltr" value={line.qty} onChange={(e) => setLine(line.key, { qty: e.target.value })} />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      dir="ltr"
                      value={line.unitCost}
                      required={mode === 'opening'}
                      onChange={(e) => setLine(line.key, { unitCost: e.target.value })}
                    />
                  </td>
                  <td>
                    <IconButton icon="trash" danger title={tr('حذف', 'Remove')} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" icon="plus" type="button" className="mt-8" onClick={() => setLines((ls) => [...ls, { key: uuid(), product: null, qty: '1', unitId: '', unitCost: '' }])}>
          {tr('إضافة صنف', 'Add product')}
        </Button>
        <div className="hint mt-8">
          {mode === 'opening'
            ? tr('تكلفة الوحدة مطلوبة لتقييم الرصيد الافتتاحي وترحيله للمخزون.', 'Unit cost is required to value and post opening stock.')
            : tr('يتم ترحيل العملية محاسبيًا تلقائيًا حسب إعدادات المخزون.', 'The operation posts to the ledger automatically.')}
        </div>
        {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
      </form>
    </Modal>
  );
}
