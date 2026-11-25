'use client';

import React from 'react';
import { PagedList } from '@/components/PagedList';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';

interface Invoice { id: string; number: number; invoiceDate: string; kind: string; status: string; total: string; customer: { code: string; nameAr: string } | null }

export default function SalesPage() {
  const { t, lang } = useApp();
  return (
    <PagedList<Invoice>
      title={t('sales')}
      path="sales/invoices"
      searchable={false}
      rowKey={(r) => r.id}
      columns={[
        { header: t('number'), render: (r) => String(r.number) },
        { header: t('date'), render: (r) => r.invoiceDate.slice(0, 10) },
        { header: t('customer'), render: (r) => r.customer?.nameAr ?? '' },
        { header: t('kind'), render: (r) => r.kind },
        { header: t('status'), render: (r) => <span className={r.status === 'CANCELLED' ? 'error' : 'ok'}>{r.status}</span> },
        { header: t('total'), numeric: true, render: (r) => formatMoney(r.total, lang) },
      ]}
    />
  );
}
