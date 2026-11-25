'use client';

import React from 'react';
import { PagedList } from '@/components/PagedList';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';

interface Product { id: string; code: string; nameAr: string; nameEn: string | null; retailPrice: string; wholesalePrice: string }

export default function ProductsPage() {
  const { t, lang } = useApp();
  return (
    <PagedList<Product>
      title={t('products')}
      path="products"
      rowKey={(r) => r.id}
      columns={[
        { header: t('code'), render: (r) => r.code },
        { header: t('name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { header: t('retailPrice'), numeric: true, render: (r) => formatMoney(r.retailPrice, lang) },
        { header: t('wholesalePrice'), numeric: true, render: (r) => formatMoney(r.wholesalePrice, lang) },
      ]}
    />
  );
}
