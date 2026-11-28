'use client';

import React from 'react';
import { useApp } from '@/components/Providers';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge } from '@/components/ui';

interface Branch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  address: string | null;
  isActive: boolean;
}

/** Branches scope users and warehouses; an unassigned account sees all branches. */
export default function BranchesPage() {
  const { tr, lang } = useApp();
  return (
    <ResourcePage<Branch>
      title={tr('الفروع', 'Branches')}
      sub={tr('الفروع والمواقع التي ينتمي إليها المستخدمون والمخازن', 'Locations that scope users and warehouses')}
      endpoint="branches"
      searchPlaceholder={tr('ابحث بالفرع…', 'Search branches…')}
      columns={[
        { key: 'code', header: tr('الكود', 'Code'), width: '130px', render: (r) => <span className="tree-code">{r.code}</span> },
        { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
        { key: 'address', header: tr('العنوان', 'Address'), render: (r) => r.address ?? '—' },
        {
          key: 'status',
          header: tr('الحالة', 'Status'),
          align: 'center',
          render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>),
        },
      ]}
      fields={[
        { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-4' },
        { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-4' },
        { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), required: true, col: 'col-4' },
        { name: 'address', label: tr('العنوان', 'Address'), col: 'col-6' },
        { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-6' },
      ]}
      createLabel={tr('فرع جديد', 'New branch')}
      emptyTitle={tr('لا توجد فروع', 'No branches')}
    />
  );
}
