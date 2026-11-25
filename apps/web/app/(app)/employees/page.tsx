'use client';

import React from 'react';
import { PagedList } from '@/components/PagedList';
import { useApp } from '@/components/Providers';
import { formatMoney } from '@/lib/format';

interface Employee { id: string; code: string; nameAr: string; nameEn: string | null; jobTitle: string | null; baseSalary: string; isActive: boolean }

export default function EmployeesPage() {
  const { t, lang } = useApp();
  return (
    <PagedList<Employee>
      title={t('employees')}
      path="hr/employees"
      rowKey={(r) => r.id}
      columns={[
        { header: t('code'), render: (r) => r.code },
        { header: t('name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { header: t('jobTitle'), render: (r) => r.jobTitle ?? '' },
        { header: t('baseSalary'), numeric: true, render: (r) => formatMoney(r.baseSalary, lang) },
        { header: t('status'), render: (r) => (r.isActive ? t('active') : t('inactive')) },
      ]}
    />
  );
}
