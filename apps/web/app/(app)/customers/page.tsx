'use client';

import React from 'react';
import { PagedList } from '@/components/PagedList';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';

interface Customer { id: string; code: string; nameAr: string; nameEn: string | null; phone: string | null; creditLimit: string }

export default function CustomersPage() {
  const { t, lang } = useApp();
  return (
    <PagedList<Customer>
      title={t('customers')}
      path="customers"
      rowKey={(r) => r.id}
      columns={[
        { header: t('code'), render: (r) => r.code },
        { header: t('name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { header: t('phone'), render: (r) => r.phone ?? '' },
        { header: t('creditLimit'), numeric: true, render: (r) => formatMoney(r.creditLimit, lang) },
      ]}
    />
  );
}
