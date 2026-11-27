'use client';

import React, { useState } from 'react';
import { useApp } from '@/components/Providers';
import { ResourceForm } from '@/components/ResourcePage';
import { Badge, Card, DataTable, EmptyState, ErrorNote, IconButton, Loading, PageHeader, Button } from '@/components/ui';
import { useApi, useOptions } from '@/lib/hooks';

interface Branch { id: string; code: string; nameAr: string; nameEn: string }
interface Warehouse {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'MAIN' | 'VEHICLE' | 'BRANCH';
  branchId: string | null;
  isActive: boolean;
}

const TYPE_LABEL: Record<string, [string, string]> = {
  MAIN: ['مخزن رئيسي', 'Main warehouse'],
  VEHICLE: ['عهدة سيارة', 'Vehicle custody'],
  BRANCH: ['فرع', 'Branch'],
};

export default function WarehousesPage() {
  const { tr, lang } = useApp();
  const { data, error, loading, reload } = useApi<Warehouse[]>('warehouses');
  const branches = useOptions<Branch>('branches?pageSize=100', (b) => ({
    value: b.id,
    label: `${b.code} · ${lang === 'ar' ? b.nameAr : b.nameEn}`,
  }));
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title={tr('المخازن والفروع', 'Warehouses & branches')} sub={tr('المخازن الرئيسية وعهد السيارات والفروع', 'Main stores, vehicle custodies and branches')}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('مخزن جديد', 'New warehouse')}</Button>
      </PageHeader>

      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <DataTable<Warehouse>
            rows={data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'code', header: tr('الكود', 'Code'), width: '120px', render: (r) => <span className="tree-code">{r.code}</span> },
              { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
              {
                key: 'type',
                header: tr('النوع', 'Type'),
                render: (r) => {
                  const l = TYPE_LABEL[r.type] ?? [r.type, r.type];
                  return <Badge tone={r.type === 'VEHICLE' ? 'info' : r.type === 'BRANCH' ? 'primary' : 'muted'}>{tr(l[0], l[1])}</Badge>;
                },
              },
              {
                key: 'branch',
                header: tr('الفرع', 'Branch'),
                render: (r) => {
                  const b = branches.options.find((o) => o.value === r.branchId);
                  return b?.label ?? '—';
                },
              },
              {
                key: 'active',
                header: tr('الحالة', 'Status'),
                align: 'center',
                render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>),
              },
              {
                key: 'actions',
                header: '',
                align: 'end',
                width: '1%',
                render: (r) => <IconButton icon="edit" title={tr('تعديل', 'Edit')} onClick={() => setEditing(r)} />,
              },
            ]}
            empty={<EmptyState title={tr('لا توجد مخازن', 'No warehouses')} />}
          />
        ) : null}
      </Card>

      <ResourceForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        endpoint="warehouses"
        mode={editing ? 'edit' : 'create'}
        id={editing?.id}
        title={editing ? tr('تعديل مخزن', 'Edit warehouse') : tr('مخزن جديد', 'New warehouse')}
        initial={(editing ?? { isActive: true, type: 'MAIN' }) as unknown as Record<string, unknown>}
        fields={[
          { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-4' },
          { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-4' },
          { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), required: true, col: 'col-4' },
          {
            name: 'type',
            label: tr('النوع', 'Type'),
            type: 'select',
            required: true,
            hideInEdit: true,
            col: 'col-4',
            options: [
              { value: 'MAIN', label: tr('مخزن رئيسي', 'Main warehouse') },
              { value: 'VEHICLE', label: tr('عهدة سيارة', 'Vehicle custody') },
              { value: 'BRANCH', label: tr('فرع', 'Branch') },
            ],
          },
          { name: 'branchId', label: tr('الفرع', 'Branch'), type: 'select', options: branches.options, col: 'col-4' },
          { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-4' },
        ]}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          reload();
        }}
      />
    </>
  );
}
