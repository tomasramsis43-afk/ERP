'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, DateText, DetailGrid, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { useApi, usePaged } from '@/lib/hooks';
import { post } from '@/lib/api';
import { queryString } from '@/lib/format';

interface Account { id: string; code: string; nameAr: string; nameEn: string; isPostable: boolean }
interface JournalLine { id: string; accountId: string; debit: string; credit: string; description: string | null; account?: { code: string; nameAr: string } }
interface Journal {
  id: string; number: number; entryDate: string; description: string; status: 'DRAFT' | 'POSTED'; source: string; sourceId?: string | null;
  lines?: JournalLine[]; reversedById?: string | null;
}

export default function JournalPage() {
  const { tr, lang } = useApp();
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const path = useMemo(() => `accounting/journal-entries${queryString({ page, pageSize, status, source, from, to })}`, [page, pageSize, status, source, from, to]);
  const { data, error, loading, reload } = usePaged<Journal>(path);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line

  return (
    <>
      <PageHeader title={tr('القيود اليومية', 'Journal entries')} sub={tr('القيود التلقائية واليدوية مع الترحيل والعكس', 'Automatic and manual entries with posting and reversal')}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('قيد جديد', 'New entry')}</Button>
      </PageHeader>
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="DRAFT">{tr('مسودة', 'Draft')}</option>
            <option value="POSTED">{tr('مرحّل', 'Posted')}</option>
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
            <option value="">{tr('كل المصادر', 'All sources')}</option>
            <option value="MANUAL">MANUAL</option>
            <option value="SALES_INVOICE">SALES_INVOICE</option>
            <option value="PURCHASE_INVOICE">PURCHASE_INVOICE</option>
            <option value="TREASURY_VOUCHER">TREASURY_VOUCHER</option>
            <option value="CHEQUE">CHEQUE</option>
            <option value="INVENTORY">INVENTORY</option>
            <option value="PAYROLL">PAYROLL</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<Journal>
              rows={data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailId(r.id)}
              columns={[
                { key: 'no', header: tr('رقم القيد', 'Entry #'), width: '100px', render: (r) => <span className="mono fw-600">#{r.number}</span> },
                { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.entryDate} />, width: '105px' },
                { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.description },
                { key: 'source', header: tr('المصدر', 'Source'), render: (r) => <span className="muted">{r.source}</span> },
                { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.status === 'POSTED' ? <Badge tone="ok">{tr('مرحّل', 'Posted')}</Badge> : <Badge tone="warn">{tr('مسودة', 'Draft')}</Badge>) },
              ]}
              empty={<EmptyState title={tr('لا توجد قيود', 'No entries')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <JournalForm open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setRefreshKey((n) => n + 1); }} />

      {detailId ? <JournalDetailModal id={detailId} onClose={() => setDetailId(null)} onDone={() => { setDetailId(null); setRefreshKey((n) => n + 1); }} /> : null}
    </>
  );
}

interface Line { key: string; accountId: string; debit: string; credit: string; description: string }

function JournalForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const accounts = useApi<Account[]>('accounting/accounts');
  const postable = (accounts.data ?? []).filter((a) => a.isPostable);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [postNow, setPostNow] = useState(true);
  const [lines, setLines] = useState<Line[]>([
    { key: '1', accountId: '', debit: '', credit: '' , description: '' },
    { key: '2', accountId: '', debit: '', credit: '', description: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setPostNow(true);
    setLines([
      { key: crypto.randomUUID(), accountId: '', debit: '', credit: '', description: '' },
      { key: crypto.randomUUID(), accountId: '', debit: '', credit: '', description: '' },
    ]);
    setError(null);
  }, [open]);

  const totals = useMemo(() => {
    const d = lines.reduce((a, l) => a + Number(l.debit || 0), 0);
    const c = lines.reduce((a, l) => a + Number(l.credit || 0), 0);
    return { d, c };
  }, [lines]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = {
        entryDate: date,
        description,
        post: postNow,
        lines: lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debit: l.debit || '0', credit: l.credit || '0', description: l.description || undefined })),
      };
      await post('accounting/journal-entries', payload);
      toast.success(tr('تم حفظ القيد', 'Entry saved'));
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('قيد يومية جديد', 'New journal entry')} size="xl"
      footer={
        <>
          <div style={{ marginInlineEnd: 'auto', fontWeight: 700 }}>
            {tr('مدين', 'Dr')}: <Money value={totals.d.toFixed(2)} /> · {tr('دائن', 'Cr')}: <Money value={totals.c.toFixed(2)} />
            {Math.abs(totals.d - totals.c) > 0.001 ? <span className="neg" style={{ marginInlineStart: 8 }}>≠</span> : <span style={{ color: 'var(--ok)', marginInlineStart: 8 }}>✓</span>}
          </div>
          <Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="je-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }
    >
      <form id="je-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('التاريخ', 'Date')} required className="col-4"><Input type="date" dir="ltr" value={date} required onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={tr('البيان', 'Description')} required className="col-8"><Input value={description} required onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label={tr('ترحيل فوري', 'Post immediately')} className="col-4">
            <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
              <label className="check"><input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} /><span>{tr('نعم', 'Yes')}</span></label>
            </div>
          </Field>
        </div>
        <div className="section-title mt-16">{tr('بنود القيد', 'Lines')}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>{tr('الحساب', 'Account')}</th>
                <th style={{ width: 120 }}>{tr('مدين', 'Debit')}</th>
                <th style={{ width: 120 }}>{tr('دائن', 'Credit')}</th>
                <th style={{ minWidth: 160 }}>{tr('بيان البند', 'Line note')}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td>
                    <Select value={line.accountId} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l)))}>
                      <option value="">—</option>
                      {postable.map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
                    </Select>
                  </td>
                  <td><Input type="number" min="0" step="0.01" dir="ltr" value={line.debit} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, debit: e.target.value } : l)))} /></td>
                  <td><Input type="number" min="0" step="0.01" dir="ltr" value={line.credit} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, credit: e.target.value } : l)))} /></td>
                  <td><Input value={line.description} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)))} /></td>
                  <td><IconButton icon="trash" danger title={tr('حذف', 'Remove')} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" icon="plus" type="button" className="mt-8" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), accountId: '', debit: '', credit: '', description: '' }])}>
          {tr('إضافة بند', 'Add line')}
        </Button>
        {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
      </form>
    </Modal>
  );
}

function JournalDetailModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading } = useApi<Journal>(`accounting/journal-entries/${id}`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);

  async function postEntry() {
    setBusy(true); setErr(null);
    try {
      await post(`accounting/journal-entries/${id}/post`, {});
      toast.success(tr('تم ترحيل القيد', 'Entry posted'));
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function reverse() {
    setBusy(true); setErr(null);
    try {
      await post(`accounting/journal-entries/${id}/reverse`, { reason, entryDate: new Date().toISOString().slice(0, 10) });
      toast.success(tr('تم عكس القيد', 'Entry reversed'));
      setReverseOpen(false);
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={data ? `${tr('قيد', 'Entry')} #${data.number}` : tr('قيد', 'Entry')} size="xl"
      footer={
        <>
          {data && data.status === 'DRAFT' ? <Button loading={busy} onClick={postEntry}>{tr('ترحيل', 'Post')}</Button> : null}
          {data && data.status === 'POSTED' ? <Button variant="danger" onClick={() => setReverseOpen(true)}>{tr('عكس', 'Reverse')}</Button> : null}
        </>
      }
    >
      <ErrorNote error={error || err} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <div>
          <DetailGrid
            items={[
              { label: tr('الرقم', 'Number'), value: <span className="mono">#{data.number}</span> },
              { label: tr('التاريخ', 'Date'), value: <DateText value={data.entryDate} /> },
              { label: tr('البيان', 'Description'), value: data.description },
              { label: tr('المصدر', 'Source'), value: data.source },
              { label: tr('الحالة', 'Status'), value: data.status === 'POSTED' ? <Badge tone="ok">{tr('مرحّل', 'Posted')}</Badge> : <Badge tone="warn">{tr('مسودة', 'Draft')}</Badge> },
            ]}
          />
          <div className="table-wrap mt-16">
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('الحساب', 'Account')}</th>
                  <th style={{ textAlign: 'end' }}>{tr('مدين', 'Debit')}</th>
                  <th style={{ textAlign: 'end' }}>{tr('دائن', 'Credit')}</th>
                  <th>{tr('بيان', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>{l.account ? `${l.account.code} · ${lang === 'ar' ? l.account.nameAr : l.account.nameAr}` : l.accountId}</td>
                    <td style={{ textAlign: 'end' }}><Money value={l.debit} /></td>
                    <td style={{ textAlign: 'end' }}><Money value={l.credit} /></td>
                    <td className="muted">{l.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={reverseOpen} onClose={() => setReverseOpen(false)} title={tr('عكس القيد', 'Reverse entry')} footer={
        <>
          <Button variant="ghost" onClick={() => setReverseOpen(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={reverse}>{tr('تأكيد', 'Confirm')}</Button>
        </>
      }>
        <Field label={tr('السبب', 'Reason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </Modal>
  );
}
