'use client';

import React, { useMemo } from 'react';
import { useApp } from './Providers';
import { useApi } from '@/lib/hooks';
import { visitOutcomeLabel, visitOutcomeTone } from '@/lib/visits';
import { Badge, Card, DataTable, DateText, ErrorNote, Loading } from './ui';

interface Visit {
  id: string;
  visitDate: string;
  visitedAt: string;
  outcome: 'SALE' | 'COLLECTION' | 'NO_ORDER' | 'SHOP_CLOSED' | 'NOT_REACHED';
  note: string | null;
  customer?: { id: string; code: string; nameAr: string } | null;
  representative?: { id: string; code: string; nameAr: string } | null;
}

/** Read-only visit history shared by customer and representative detail screens. */
export function VisitsTab({
  customerId,
  representativeId,
  routeId,
}: {
  customerId?: string;
  representativeId?: string;
  routeId?: string;
}) {
  const { tr, lang } = useApp();
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (customerId) p.set('customerId', customerId);
    if (representativeId) p.set('representativeId', representativeId);
    if (routeId) p.set('routeId', routeId);
    const qs = p.toString();
    return `routes/visits${qs ? `?${qs}` : ''}`;
  }, [customerId, representativeId, routeId]);
  const visits = useApi<Visit[]>(path);

  return (
    <div className="mt-16">
      <ErrorNote error={visits.error} />
      {visits.loading && !visits.data ? <Loading /> : null}
      {visits.data ? (
        <Card>
          <DataTable<Visit>
            rows={visits.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.visitDate} />, width: '120px' },
              ...(!customerId ? [{ key: 'customer', header: tr('العميل', 'Customer'), render: (r: Visit) => r.customer ? (lang === 'ar' ? r.customer.nameAr : r.customer.code) : '—' }] : []),
              ...(!representativeId ? [{ key: 'rep', header: tr('المندوب', 'Representative'), render: (r: Visit) => r.representative ? (lang === 'ar' ? r.representative.nameAr : r.representative.code) : '—' }] : []),
              { key: 'outcome', header: tr('النتيجة', 'Outcome'), render: (r) => <Badge tone={visitOutcomeTone(r.outcome)}>{visitOutcomeLabel(r.outcome, tr)}</Badge> },
              { key: 'note', header: tr('ملاحظة', 'Note'), render: (r) => r.note || '—' },
            ]}
            empty={<div className="empty">{tr('لا توجد زيارات مسجلة', 'No visits recorded')}</div>}
          />
        </Card>
      ) : null}
    </div>
  );
}
