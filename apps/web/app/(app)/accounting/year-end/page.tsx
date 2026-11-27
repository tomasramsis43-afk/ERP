'use client';

import React, { useEffect, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Loading, Modal, Money, PageHeader, Select, SummaryStrip } from '@/components/ui';
import { useApi, useMe, can } from '@/lib/hooks';
import { post } from '@/lib/api';

interface Period { id: string; name: string; startDate: string; endDate: string; status: 'OPEN' | 'CLOSED' }
interface PreviewRow { code: string; nameAr: string; nameEn: string; type: string; balance: string }
interface Preview {
  period: Period;
  alreadyClosed: boolean;
  accounts: PreviewRow[];
  netProfit: string;
}

export default function YearEndPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const me = useMe();
  const periods = useApi<Period[]>('fiscal-periods');
  const [periodId, setPeriodId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!periodId && periods.data && periods.data.length) setPeriodId(periods.data[0].id);
  }, [periods.data, periodId]);

  const preview = useApi<Preview>(periodId ? `accounting/year-end/${periodId}/preview` : null);
  const canClose = can(me, 'accounting:approve');
  const period = preview.data?.period;
  const profit = Number(preview.data?.netProfit ?? 0);
  const closable = Boolean(preview.data) && !preview.data!.alreadyClosed && period?.status === 'OPEN' && preview.data!.accounts.length > 0;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      await post(`accounting/year-end/${periodId}/close`, {});
      toast.success(tr('تم إقفال الفترة وترحيل الأرباح', 'Period closed and profit transferred'));
      setConfirming(false);
      preview.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={tr('الإقفال السنوي', 'Year-end closing')}
        sub={tr('إقفال الإيرادات والمصروفات في الأرباح والخسائر ثم ترحيلها إلى الأرباح المرحلة', 'Close revenue and expenses into profit and loss, then into retained earnings')}
      />
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Field label={tr('الفترة المحاسبية', 'Fiscal period')} className="col-4">
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {(periods.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)}</option>
              ))}
            </Select>
          </Field>
          <div className="spacer" />
          {period ? (period.status === 'OPEN' ? <Badge tone="ok">{tr('مفتوحة', 'Open')}</Badge> : <Badge tone="muted">{tr('مغلقة', 'Closed')}</Badge>) : null}
          {preview.data?.alreadyClosed ? <Badge tone="info">{tr('تم الإقفال', 'Entries posted')}</Badge> : null}
          {canClose ? (
            <Button icon="check" disabled={!closable} onClick={() => { setError(null); setConfirming(true); }}>
              {tr('إقفال الفترة', 'Close period')}
            </Button>
          ) : null}
        </div>
        <ErrorNote error={periods.error || preview.error} />
        {preview.loading && !preview.data ? <Loading /> : null}
        {preview.data ? (
          <>
            <DataTable<PreviewRow>
              rows={preview.data.accounts}
              rowKey={(r) => r.code}
              columns={[
                { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
                { key: 'name', header: tr('الحساب', 'Account'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
                { key: 'type', header: tr('النوع', 'Type'), render: (r) => (r.type === 'REVENUE' ? tr('إيراد', 'Revenue') : tr('مصروف', 'Expense')) },
                { key: 'bal', header: tr('الرصيد (مدين − دائن)', 'Balance (Dr − Cr)'), align: 'end', render: (r) => <Money value={r.balance} /> },
              ]}
              empty={<EmptyState title={tr('لا توجد حركات للإقفال', 'Nothing to close')} sub={tr('لا إيرادات أو مصروفات مرحّلة في هذه الفترة', 'No posted revenue or expenses in this period')} />}
            />
            <SummaryStrip
              items={[
                { label: profit >= 0 ? tr('صافي الربح', 'Net profit') : tr('صافي الخسارة', 'Net loss'), value: <Money value={Math.abs(profit).toFixed(2)} bold /> },
              ]}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={tr('تأكيد الإقفال السنوي', 'Confirm year-end closing')}
        subtitle={period ? `${period.name} · ${period.endDate.slice(0, 10)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>{tr('تراجع', 'Back')}</Button>
            <Button loading={busy} onClick={close}>{tr('تأكيد الإقفال', 'Confirm closing')}</Button>
          </>
        }
      >
        <p>{tr('سيتم ترحيل قيدين بتاريخ آخر يوم في الفترة، ولا يمكن تعديلهما بعد الترحيل (التصحيح يتم بقيد عكسي).', 'Two entries dated the last day of the period will be posted. They cannot be edited afterwards; correct them with a reversal.')}</p>
        <ErrorNote error={error} />
      </Modal>
    </>
  );
}
