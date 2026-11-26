'use client';

import React, { useState } from 'react';
import { useApp } from '@/components/Providers';
import { ResourceForm } from '@/components/ResourcePage';
import { Button, Card, DataTable, EmptyState, ErrorNote, Loading, PageHeader, Tabs } from '@/components/ui';
import { useApi } from '@/lib/hooks';

interface Unit { id: string; code: string; nameAr: string; nameEn: string }
interface Category { id: string; nameAr: string; nameEn: string; parentId: string | null }

export default function CatalogPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'units' | 'categories'>('units');
  const [creating, setCreating] = useState(false);
  const units = useApi<Unit[]>('units');
  const categories = useApi<Category[]>('product-categories');

  const catName = (id: string | null) => {
    const c = (categories.data ?? []).find((x) => x.id === id);
    return c ? (lang === 'ar' ? c.nameAr : c.nameEn) : '—';
  };

  return (
    <>
      <PageHeader title={tr('الوحدات والتصنيفات', 'Units & categories')} sub={tr('وحدات القياس وتصنيفات الأصناف', 'Measurement units and product categories')}>
        <Button icon="plus" onClick={() => setCreating(true)}>
          {tab === 'units' ? tr('وحدة جديدة', 'New unit') : tr('تصنيف جديد', 'New category')}
        </Button>
      </PageHeader>

      <Card>
        <div style={{ padding: '0 16px' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'units', label: tr('وحدات القياس', 'Units') },
              { id: 'categories', label: tr('التصنيفات', 'Categories') },
            ]}
          />
        </div>

        {tab === 'units' ? (
          <>
            <ErrorNote error={units.error} />
            {units.loading && !units.data ? <Loading /> : null}
            {units.data ? (
              <DataTable<Unit>
                rows={units.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'code', header: tr('الكود', 'Code'), width: '140px', render: (r) => <span className="tree-code">{r.code}</span> },
                  { key: 'nameAr', header: tr('الاسم بالعربية', 'Arabic name'), render: (r) => r.nameAr },
                  { key: 'nameEn', header: tr('الاسم بالإنجليزية', 'English name'), render: (r) => r.nameEn },
                ]}
                empty={<EmptyState title={tr('لا توجد وحدات', 'No units')} />}
              />
            ) : null}
          </>
        ) : (
          <>
            <ErrorNote error={categories.error} />
            {categories.loading && !categories.data ? <Loading /> : null}
            {categories.data ? (
              <DataTable<Category>
                rows={categories.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'nameAr', header: tr('الاسم بالعربية', 'Arabic name'), render: (r) => r.nameAr },
                  { key: 'nameEn', header: tr('الاسم بالإنجليزية', 'English name'), render: (r) => r.nameEn },
                  { key: 'parent', header: tr('التصنيف الأب', 'Parent'), render: (r) => catName(r.parentId) },
                ]}
                empty={<EmptyState title={tr('لا توجد تصنيفات', 'No categories')} />}
              />
            ) : null}
          </>
        )}
      </Card>

      <ResourceForm
        open={creating}
        onClose={() => setCreating(false)}
        endpoint={tab === 'units' ? 'units' : 'product-categories'}
        mode="create"
        title={tab === 'units' ? tr('وحدة جديدة', 'New unit') : tr('تصنيف جديد', 'New category')}
        initial={{}}
        fields={
          tab === 'units'
            ? [
                { name: 'code', label: tr('الكود', 'Code'), required: true, col: 'col-4', placeholder: 'PCS' },
                { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-4' },
                { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), required: true, col: 'col-4' },
              ]
            : [
                { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-6' },
                { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), required: true, col: 'col-6' },
                {
                  name: 'parentId',
                  label: tr('التصنيف الأب', 'Parent category'),
                  type: 'select',
                  col: 'col-6',
                  options: (categories.data ?? []).map((c) => ({ value: c.id, label: lang === 'ar' ? c.nameAr : c.nameEn })),
                },
              ]
        }
        onSaved={() => {
          setCreating(false);
          if (tab === 'units') units.reload();
          else categories.reload();
        }}
      />
    </>
  );
}
