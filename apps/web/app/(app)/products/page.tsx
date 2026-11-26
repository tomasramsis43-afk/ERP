'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  Tabs,
} from '@/components/ui';
import { useApi, useDebounced, usePaged } from '@/lib/hooks';
import { post, patch, put } from '@/lib/api';
import { queryString } from '@/lib/format';

interface Unit { id: string; code: string; nameAr: string; nameEn: string }
interface Category { id: string; nameAr: string; nameEn: string }
interface ProductUnit { id?: string; unitId: string; factor: string; barcode?: string | null; unit?: Unit }
interface Product {
  id: string;
  code: string;
  barcode: string | null;
  nameAr: string;
  nameEn: string;
  categoryId: string | null;
  category?: Category | null;
  baseUnitId: string;
  baseUnit?: Unit;
  purchasePrice: string;
  retailPrice: string;
  wholesalePrice: string;
  reorderLevel: string;
  isActive: boolean;
  units?: ProductUnit[];
  createdAt?: string;
}

const EMPTY: Record<string, string | boolean> = {
  code: '',
  barcode: '',
  nameAr: '',
  nameEn: '',
  categoryId: '',
  baseUnitId: '',
  purchasePrice: '',
  retailPrice: '',
  wholesalePrice: '',
  reorderLevel: '',
  isActive: true,
};

export default function ProductsPage() {
  const { tr, lang } = useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [draft, setDraft] = useState('');
  const q = useDebounced(draft, 350).trim();
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);

  const categories = useApi<Category[]>('product-categories');
  const path = useMemo(
    () => `products${queryString({ page, pageSize, q, categoryId, active })}`,
    [page, pageSize, q, categoryId, active],
  );
  const { data, error, loading, reload } = usePaged<Product>(path);

  useEffect(() => setPage(1), [q, categoryId, active]);

  return (
    <>
      <PageHeader title={tr('الأصناف', 'Products')} sub={tr('الأسعار والوحدات والباركود وحدود الطلب', 'Prices, units, barcodes and reorder levels')}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('صنف جديد', 'New product')}</Button>
      </PageHeader>

      <Card>
        <div className="toolbar" style={{ padding: '14px 16px 0' }}>
          <div className="search-global search" style={{ width: 'auto', flex: '0 1 300px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input value={draft} placeholder={tr('ابحث بالاسم أو الكود أو الباركود…', 'Search name, code or barcode…')} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: 'auto', minWidth: 170 }}>
            <option value="">{tr('كل التصنيفات', 'All categories')}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{lang === 'ar' ? c.nameAr : c.nameEn}</option>
            ))}
          </Select>
          <Select value={active} onChange={(e) => setActive(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="true">{tr('نشط', 'Active')}</option>
            <option value="false">{tr('موقوف', 'Inactive')}</option>
          </Select>
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<Product>
              rows={data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetail(r)}
              columns={[
                { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
                {
                  key: 'name',
                  header: tr('الصنف', 'Product'),
                  render: (r) => (
                    <div>
                      <div className="fw-600">{lang === 'ar' ? r.nameAr : r.nameEn}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.category ? (lang === 'ar' ? r.category.nameAr : r.category.nameEn) : '—'}
                        {r.barcode ? ` · ${r.barcode}` : ''}
                      </div>
                    </div>
                  ),
                },
                { key: 'unit', header: tr('الوحدة الأساسية', 'Base unit'), render: (r) => (r.baseUnit ? (lang === 'ar' ? r.baseUnit.nameAr : r.baseUnit.nameEn) : '—') },
                { key: 'purchase', header: tr('سعر الشراء', 'Purchase'), align: 'end', render: (r) => <Money value={r.purchasePrice} /> },
                { key: 'retail', header: tr('قطاعي', 'Retail'), align: 'end', render: (r) => <Money value={r.retailPrice} bold /> },
                { key: 'wholesale', header: tr('جملة', 'Wholesale'), align: 'end', render: (r) => <Money value={r.wholesalePrice} /> },
                { key: 'reorder', header: tr('حد الطلب', 'Reorder'), align: 'end', render: (r) => <Qty value={r.reorderLevel} /> },
                { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => (
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <IconButton icon="edit" title={tr('تعديل', 'Edit')} onClick={() => setEditing(r)} />
                    </div>
                  ),
                },
              ]}
              empty={<EmptyState title={tr('لا توجد أصناف', 'No products')} sub={tr('ابدأ بإضافة أول صنف', 'Add your first product')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <ProductForm
        open={creating || Boolean(editing)}
        product={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />

      {detail ? (
        <Modal open onClose={() => setDetail(null)} title={`${detail.code} · ${lang === 'ar' ? detail.nameAr : detail.nameEn}`} size="xl">
          <ProductDetail product={detail} onChanged={reload} />
        </Modal>
      ) : null}
    </>
  );
}

function ProductForm({ open, product, onClose, onSaved }: { open: boolean; product: Product | null; onClose: () => void; onSaved: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const units = useApi<Unit[]>('units');
  const categories = useApi<Category[]>('product-categories');
  const [values, setValues] = useState<Record<string, string | boolean>>(EMPTY);
  const [unitRows, setUnitRows] = useState<{ unitId: string; factor: string; barcode: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setValues({
        code: product.code,
        barcode: product.barcode ?? '',
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        categoryId: product.categoryId ?? '',
        baseUnitId: product.baseUnitId,
        purchasePrice: product.purchasePrice,
        retailPrice: product.retailPrice,
        wholesalePrice: product.wholesalePrice,
        reorderLevel: product.reorderLevel,
        isActive: product.isActive,
      });
      setUnitRows((product.units ?? []).filter((u) => u.unitId !== product.baseUnitId).map((u) => ({ unitId: u.unitId, factor: u.factor, barcode: u.barcode ?? '' })));
    } else {
      setValues(EMPTY);
      setUnitRows([]);
    }
  }, [open, product]);

  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) if (v !== '' && v !== undefined && v !== null) payload[k] = v;
      payload.units = unitRows.filter((u) => u.unitId && u.factor).map((u) => ({ unitId: u.unitId, factor: u.factor, ...(u.barcode ? { barcode: u.barcode } : {}) }));
      if (product) {
        delete payload.code;
        delete payload.baseUnitId;
        await patch(`products/${product.id}`, payload);
      } else {
        await post('products', payload);
      }
      toast.success(tr('تم حفظ الصنف', 'Product saved'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? tr('تعديل صنف', 'Edit product') : tr('صنف جديد', 'New product')}
      size="xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="product-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('الكود', 'Code')} required className="col-3">
            <Input value={String(values.code)} required disabled={Boolean(product)} onChange={(e) => set('code', e.target.value)} placeholder="P-001" />
          </Field>
          <Field label={tr('الباركود', 'Barcode')} className="col-3">
            <Input value={String(values.barcode)} onChange={(e) => set('barcode', e.target.value)} dir="ltr" />
          </Field>
          <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-3">
            <Input value={String(values.nameAr)} required onChange={(e) => set('nameAr', e.target.value)} />
          </Field>
          <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-3">
            <Input value={String(values.nameEn)} required onChange={(e) => set('nameEn', e.target.value)} />
          </Field>
          <Field label={tr('التصنيف', 'Category')} className="col-4">
            <Select value={String(values.categoryId)} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">—</option>
              {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.nameAr : c.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={tr('الوحدة الأساسية', 'Base unit')} required className="col-4">
            <Select value={String(values.baseUnitId)} required disabled={Boolean(product)} onChange={(e) => set('baseUnitId', e.target.value)}>
              <option value="">—</option>
              {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{lang === 'ar' ? u.nameAr : u.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={tr('حد إعادة الطلب', 'Reorder level')} className="col-4">
            <Input type="number" min="0" step="0.0001" dir="ltr" value={String(values.reorderLevel)} onChange={(e) => set('reorderLevel', e.target.value)} />
          </Field>
          <Field label={tr('سعر الشراء', 'Purchase price')} className="col-4">
            <Input type="number" min="0" step="0.01" dir="ltr" value={String(values.purchasePrice)} onChange={(e) => set('purchasePrice', e.target.value)} />
          </Field>
          <Field label={tr('سعر القطاعي', 'Retail price')} className="col-4">
            <Input type="number" min="0" step="0.01" dir="ltr" value={String(values.retailPrice)} onChange={(e) => set('retailPrice', e.target.value)} />
          </Field>
          <Field label={tr('سعر الجملة', 'Wholesale price')} className="col-4">
            <Input type="number" min="0" step="0.01" dir="ltr" value={String(values.wholesalePrice)} onChange={(e) => set('wholesalePrice', e.target.value)} />
          </Field>
          <Field label={tr('نشط', 'Active')} className="col-4">
            <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
              <label className="check">
                <input type="checkbox" checked={Boolean(values.isActive)} onChange={(e) => set('isActive', e.target.checked)} />
                <span>{tr('متاح للبيع', 'Available for sale')}</span>
              </label>
            </div>
          </Field>
        </div>

        <div className="section-title mt-16">{tr('وحدات القياس والتحويل', 'Units & conversion')}</div>
        <div className="hint mb-8">{tr('مثال: كرتونة = 12 قطعة. العامل هو عدد الوحدات الأساسية داخل الوحدة.', 'Example: carton = 12 pieces. The factor is how many base units one unit contains.')}</div>
        {unitRows.map((row, i) => (
          <div key={i} className="form-grid" style={{ alignItems: 'end', marginBottom: 8 }}>
            <Field label={tr('الوحدة', 'Unit')} className="col-4">
              <Select value={row.unitId} onChange={(e) => setUnitRows((rows) => rows.map((r, j) => (j === i ? { ...r, unitId: e.target.value } : r)))}>
                <option value="">—</option>
                {(units.data ?? []).filter((u) => u.id !== String(values.baseUnitId)).map((u) => (
                  <option key={u.id} value={u.id}>{lang === 'ar' ? u.nameAr : u.nameEn}</option>
                ))}
              </Select>
            </Field>
            <Field label={tr('المعامل', 'Factor')} className="col-3">
              <Input type="number" min="0.0001" step="0.0001" dir="ltr" value={row.factor} onChange={(e) => setUnitRows((rows) => rows.map((r, j) => (j === i ? { ...r, factor: e.target.value } : r)))} />
            </Field>
            <Field label={tr('باركود الوحدة', 'Unit barcode')} className="col-3">
              <Input value={row.barcode} dir="ltr" onChange={(e) => setUnitRows((rows) => rows.map((r, j) => (j === i ? { ...r, barcode: e.target.value } : r)))} />
            </Field>
            <div className="col-2">
              <IconButton icon="trash" danger title={tr('حذف', 'Remove')} onClick={() => setUnitRows((rows) => rows.filter((_, j) => j !== i))} />
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon="plus" type="button" onClick={() => setUnitRows((rows) => [...rows, { unitId: '', factor: '', barcode: '' }])}>
          {tr('إضافة وحدة', 'Add unit')}
        </Button>

        {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
      </form>
    </Modal>
  );
}

interface CustomerPrice { id: string; customerId: string; price: string; customer: { code: string; nameAr: string } }
interface CustomerOption { id: string; code: string; nameAr: string }

function ProductDetail({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<'info' | 'units' | 'prices'>('info');
  const prices = useApi<CustomerPrice[]>(`products/${product.id}/customer-prices`);
  const customers = useApi<{ items: CustomerOption[] }>('customers?pageSize=100');
  const [customerId, setCustomerId] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePrice() {
    setBusy(true);
    setError(null);
    try {
      await put(`products/${product.id}/customer-prices`, { customerId, price });
      toast.success(tr('تم حفظ السعر الخاص', 'Customer price saved'));
      setCustomerId('');
      setPrice('');
      prices.reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'info', label: tr('البيانات', 'Details') },
          { id: 'units', label: tr('الوحدات', 'Units') },
          { id: 'prices', label: tr('أسعار العملاء', 'Customer prices') },
        ]}
      />
      <div className="mt-16">
        {tab === 'info' ? (
          <DetailGrid
            items={[
              { label: tr('الكود', 'Code'), value: <span className="mono">{product.code}</span> },
              { label: tr('الباركود', 'Barcode'), value: product.barcode || '—' },
              { label: tr('الاسم', 'Name'), value: lang === 'ar' ? product.nameAr : product.nameEn },
              { label: tr('التصنيف', 'Category'), value: product.category ? (lang === 'ar' ? product.category.nameAr : product.category.nameEn) : '—' },
              { label: tr('الوحدة الأساسية', 'Base unit'), value: product.baseUnit ? (lang === 'ar' ? product.baseUnit.nameAr : product.baseUnit.nameEn) : '—' },
              { label: tr('سعر الشراء', 'Purchase price'), value: <Money value={product.purchasePrice} /> },
              { label: tr('سعر القطاعي', 'Retail price'), value: <Money value={product.retailPrice} /> },
              { label: tr('سعر الجملة', 'Wholesale price'), value: <Money value={product.wholesalePrice} /> },
              { label: tr('حد الطلب', 'Reorder level'), value: <Qty value={product.reorderLevel} /> },
              { label: tr('أضيف في', 'Created'), value: <DateText value={product.createdAt} /> },
            ]}
          />
        ) : null}

        {tab === 'units' ? (
          <DataTable<ProductUnit>
            rows={product.units ?? []}
            rowKey={(r) => r.id ?? r.unitId}
            columns={[
              { key: 'unit', header: tr('الوحدة', 'Unit'), render: (r) => (r.unit ? (lang === 'ar' ? r.unit.nameAr : r.unit.nameEn) : r.unitId) },
              { key: 'factor', header: tr('المعامل', 'Factor'), align: 'end', render: (r) => <Qty value={r.factor} /> },
              { key: 'barcode', header: tr('الباركود', 'Barcode'), render: (r) => r.barcode || '—' },
            ]}
            empty={<EmptyState title={tr('لا توجد وحدات إضافية', 'No additional units')} />}
          />
        ) : null}

        {tab === 'prices' ? (
          <>
            <Card>
              <DataTable<CustomerPrice>
                rows={prices.data ?? []}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'code', header: tr('كود العميل', 'Customer code'), render: (r) => <span className="tree-code">{r.customer.code}</span> },
                  { key: 'name', header: tr('العميل', 'Customer'), render: (r) => r.customer.nameAr },
                  { key: 'price', header: tr('السعر الخاص', 'Special price'), align: 'end', render: (r) => <Money value={r.price} bold /> },
                ]}
                empty={<EmptyState title={tr('لا توجد أسعار خاصة', 'No customer-specific prices')} />}
              />
            </Card>
            <div className="form-grid mt-16" style={{ alignItems: 'end' }}>
              <Field label={tr('العميل', 'Customer')} className="col-6">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">—</option>
                  {(customers.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.nameAr}</option>)}
                </Select>
              </Field>
              <Field label={tr('السعر', 'Price')} className="col-3">
                <Input type="number" min="0" step="0.01" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <div className="col-3">
                <Button icon="save" loading={busy} disabled={!customerId || !price} onClick={savePrice}>{tr('حفظ السعر', 'Save price')}</Button>
              </div>
            </div>
            {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
