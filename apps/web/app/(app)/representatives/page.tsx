'use client';

import React from 'react';
import { PagedList } from '@/components/PagedList';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';

interface Rep { id: string; code: string; nameAr: string; nameEn: string | null; isActive: boolean; custodyBalance: string; vehicle: { plateNumber: string } | null }

export default function RepresentativesPage() {
  const { t, lang } = useApp();
  return (
    <PagedList<Rep>
      title={t('representatives')}
      path="representatives"
      rowKey={(r) => r.id}
      columns={[
        { header: t('code'), render: (r) => r.code },
        { header: t('name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { header: t('vehicle'), render: (r) => r.vehicle?.plateNumber ?? '' },
        { header: t('custody'), numeric: true, render: (r) => formatMoney(r.custodyBalance, lang) },
        { header: t('status'), render: (r) => (r.isActive ? t('active') : t('inactive')) },
      ]}
    />
  );
}
