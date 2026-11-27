'use client';

import React, { useMemo, useState } from 'react';
import { useApp } from '@/components/Providers';
import { Card, DataTable, DateText, EmptyState, ErrorNote, Field, Input, PageHeader, Pagination, Qty, Select } from '@/components/ui';
import { useApi, usePaged } from '@/lib/hooks';
import { queryString } from '@/lib/format';

interface Layer {
  id: string;
  batchNo: string | null;
  expiryDate: string | null;
  remaining: string;
  quantity: string;
  unitCost: string;
  receivedAt: string;
  product: { code: string; nameAr: string; nameEn: string };
  warehouse: { code: string; nameAr: string; nameEn: string };
}
interface Warehouse { id: string; code: string; nameAr: string; nameEn: string }

export default function BatchesPage() {
  const { tr, lang } = useApp();
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');
  const [expiringWithinDays, setExpiringWithinDays] = useState('');
  const warehouses = useApi<Warehouse[]>('warehouses');

  const path = useMemo(
    () => `inventory/batches${queryString({ page, pageSize: 50, warehouseId, expiringWithinDays })}`,
    [page, warehouseId, expiringWithinDays],
  );
  const layers = usePaged<Layer>(path);
  const name = (a: { nameAr: string; nameEn: string }) => (lang === 'ar' ? a.nameAr : a.nameEn);

  return (
    <>
      <PageHeader
        title={tr('الباتشات وتواريخ الصلاحية', 'Batches & expiry')}
        sub={tr('طبقات التكلفة المتبقية مرتبة حسب تاريخ الصلاحية (FEFO)', 'Remaining cost layers ordered by expiry date (FEFO)')}
      />
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Field label={tr('المخزن', 'Warehouse')} className="col-3">
            <Select value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}>
              <option value="">{tr('كل المخازن', 'All warehouses')}</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.code} · {name(w)}</option>)}
            </Select>
          </Field>
          <Field label={tr('ينتهي خلال (يوم)', 'Expiring within (days)')} className="col-3">
            <Input type="number" min={1} value={expiringWithinDays} onChange={(e) => { setExpiringWithinDays(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <ErrorNote error={layers.error} />
        {layers.loading && !layers.data ? <div style={{ padding: 16 }}>{tr('جار التحميل...', 'Loading...')}</div> : null}
        <DataTable<Layer>
          rows={layers.data?.items ?? []}
          rowKey={(r) => r.id}
          columns={[
            { key: 'product', header: tr('الصنف', 'Product'), render: (r) => `${r.product.code} · ${name(r.product)}` },
            { key: 'warehouse', header: tr('المخزن', 'Warehouse'), render: (r) => r.warehouse.code },
            { key: 'batch', header: tr('الباتش', 'Batch'), render: (r) => r.batchNo ?? '—' },
            { key: 'expiry', header: tr('الصلاحية', 'Expiry'), render: (r) => (r.expiryDate ? <DateText value={r.expiryDate} /> : '—') },
            { key: 'remaining', header: tr('المتبقي', 'Remaining'), align: 'end', render: (r) => <Qty value={r.remaining} /> },
            { key: 'cost', header: tr('سعر الوحدة', 'Unit cost'), align: 'end', render: (r) => <Qty value={r.unitCost} /> },
          ]}
          empty={<EmptyState title={tr('لا توجد طبقات', 'No batches')} sub={tr('لم يتم تسجيل باتشات أو تواريخ صلاحية بعد', 'No batches or expiry dates recorded yet')} />}
        />
        <Pagination
          page={layers.data?.page ?? page}
          pageSize={layers.data?.pageSize ?? 50}
          total={layers.data?.total ?? layers.data?.items.length ?? 0}
          onPage={setPage}
        />
      </Card>
    </>
  );
}
