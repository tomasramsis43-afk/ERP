'use client';

import React, { useMemo, useState } from 'react';
import { useApp, useConfirm, useToast } from '@/components/Providers';
import { Badge, Button, DataTable, DateText, DetailGrid, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Qty, Select, SummaryStrip, Tabs, Textarea } from '@/components/ui';
import { ResourcePage } from '@/components/ResourcePage';
import { useApi, useOptions, usePaged } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface Rep { id: string; code: string; nameAr: string; nameEn: string | null; isActive: boolean; custodyBalance?: string; route?: { nameAr: string } | null; vehicle?: { plateNumber: string } | null }
interface Rule { id: string; representativeId: string | null; basis: 'SALES' | 'COLLECTIONS' | 'MARGIN'; ratePercent: string; productId: string | null; customerId: string | null; geoAreaId: string | null; createdAt: string }
interface Commission { id: string; sourceType: string; amount: string; createdAt: string; paidAt: string | null }
interface ClosingRow { differenceReason?: string | null; id: string; closingDate: string; salesCash: string; salesCredit: string; collections: string; expectedCash: string; declaredCash: string; cashDifference: string; stockDifferenceValue: string; commissionTotal: string }

const BASIS_LABEL = (tr: (a: string, e: string) => string): Record<string, string> => ({
  SALES: tr('نسبة من المبيعات', '% of sales'),
  COLLECTIONS: tr('نسبة من التحصيلات', '% of collections'),
  MARGIN: tr('نسبة من هامش الربح', '% of margin'),
});

export default function RepresentativesPage() {
  const { tr } = useApp();
  const [tab, setTab] = useState<'reps' | 'rules'>('reps');
  return (
    <>
      <PageHeader title={tr('المناديب', 'Representatives')} sub={tr('العهد والتسويات والعمولات', 'Custody, settlements and commissions')} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'reps', label: tr('المناديب', 'Representatives') },
        { id: 'rules', label: tr('قواعد العمولات', 'Commission rules') },
      ]} />
      <div className="mt-16">{tab === 'reps' ? <RepsList /> : <RulesTab />}</div>
    </>
  );
}

function RepsList() {
  const { tr, lang } = useApp();
  const routes = useOptions<{ id: string; nameAr: string }>('routes?pageSize=100', (r) => ({ value: r.id, label: r.nameAr }));
  const vehicles = useOptions<{ id: string; plateNumber: string }>('vehicles?pageSize=100', (v) => ({ value: v.id, label: v.plateNumber }));
  const users = useOptions<{ id: string; fullName: string; email: string }>('users?pageSize=100', (u) => ({ value: u.id, label: `${u.fullName} (${u.email})` }));
  return (
    <ResourcePage<Rep>
      title={tr('المناديب', 'Representatives')}
      endpoint="representatives"
      searchPlaceholder={tr('ابحث…', 'Search…')}
      columns={[
        { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code}</span> },
        { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { key: 'route', header: tr('الخط', 'Route'), render: (r) => r.route?.nameAr ?? '—' },
        { key: 'vehicle', header: tr('السيارة', 'Vehicle'), render: (r) => r.vehicle?.plateNumber ?? '—' },
        { key: 'custody', header: tr('رصيد العهدة', 'Custody balance'), align: 'end', render: (r) => <Money value={r.custodyBalance ?? '0'} bold /> },
        { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
      ]}
      // Only fields the API accepts: it rejects unknown properties (whitelist + forbidNonWhitelisted).
      // Salary lives in HR employees; the custody cash box is created automatically by the server.
      fields={[
        { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-4', hint: tr('حروف وأرقام - _ فقط (حتى 20)', 'Letters, digits, - and _ only (max 20)') },
        { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-4' },
        { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), col: 'col-4' },
        { name: 'phone', label: tr('الهاتف', 'Phone'), type: 'tel', col: 'col-4' },
        { name: 'routeId', label: tr('الخط', 'Route'), type: 'select', options: routes.options, col: 'col-4' },
        { name: 'vehicleId', label: tr('السيارة', 'Vehicle'), type: 'select', options: vehicles.options, col: 'col-4' },
        { name: 'userId', label: tr('مستخدم تطبيق المندوب', 'Mobile-app login'), type: 'select', options: users.options, hideInEdit: true, col: 'col-4' },
        { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-4' },
      ]}
      createLabel={tr('مندوب جديد', 'New representative')}
      renderDetail={(r) => <RepDetail rep={r} />}
    />
  );
}

function RepDetail({ rep }: { rep: Rep }) {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'info' | 'closing' | 'history' | 'commissions'>('info');
  const { data } = useApi<any>(`representatives/${rep.id}`);
  const d = data ?? rep;
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'info', label: tr('البيانات', 'Details') },
        { id: 'closing', label: tr('إقفال اليوم', 'Close day') },
        { id: 'history', label: tr('سجل الإقفالات', 'Closings') },
        { id: 'commissions', label: tr('العمولات', 'Commissions') },
      ]} />
      <div className="mt-16">
        {tab === 'info' ? (
          <>
            <SummaryStrip items={[
              { label: tr('رصيد العهدة', 'Custody balance'), value: <Money value={d.custodyBalance ?? '0'} bold /> },
              { label: tr('السيارة', 'Vehicle'), value: d.vehicle?.plateNumber ?? '—' },
            ]} />
            <div className="mt-16">
              <DetailGrid items={[
                { label: tr('الكود', 'Code'), value: d.code },
                { label: tr('الاسم', 'Name'), value: lang === 'ar' ? d.nameAr : d.nameEn || d.nameAr },
                { label: tr('الخط', 'Route'), value: d.route?.nameAr ?? '—' },
                { label: tr('الحالة', 'Status'), value: d.isActive ? tr('نشط', 'Active') : tr('موقوف', 'Inactive') },
              ]} />
            </div>
            <div className="mt-16">
              <div className="section-title">{tr('مخزون السيارة', 'Vehicle stock')}</div>
              <DataTable<any>
                rows={d.vehicleStock ?? []}
                rowKey={(r, i) => r.productId ?? String(i)}
                columns={[
                  { key: 'code', header: tr('الكود', 'Code'), render: (r) => r.product?.code },
                  { key: 'name', header: tr('الصنف', 'Product'), render: (r) => (lang === 'ar' ? r.product?.nameAr : r.product?.nameEn) },
                  { key: 'qty', header: tr('الكمية', 'Qty'), align: 'end', render: (r) => <Qty value={r.quantity} /> },
                ]}
                empty={<EmptyState title={tr('لا يوجد مخزون', 'No stock')} />}
              />
            </div>
          </>
        ) : null}
        {tab === 'closing' ? <ClosingTab rep={rep} onClosed={() => setTab('history')} /> : null}
        {tab === 'history' ? <HistoryTab repId={rep.id} /> : null}
        {tab === 'commissions' ? <CommissionsTab repId={rep.id} /> : null}
      </div>
    </div>
  );
}

const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

function ClosingTab({ rep, onClosed }: { rep: Rep; onClosed: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(today());
  const [preview, setPreview] = useState<any>(null);
  const [declared, setDeclared] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadPreview() {
    setBusy(true); setErr(null);
    try {
      const p = await get<any>(`representatives/${rep.id}/closing-preview?date=${date}`);
      setPreview(p);
      // Deliberately empty: pre-filling the system's own numbers would hide real shortages.
      setDeclared('');
      setCounts({});
      setReason('');
    } catch (e) { setErr((e as Error).message); setPreview(null); }
    finally { setBusy(false); }
  }

  const lines: any[] = preview?.lines ?? [];
  const cashDiff = preview && num(declared) !== null ? num(declared)! - Number(preview.expectedCash) : null;
  const missing = lines.filter((l) => num(counts[l.productId] ?? '') === null).length;
  const diffLines = lines.filter((l) => num(counts[l.productId] ?? '') !== null && Number(counts[l.productId]) !== Number(l.expectedQty)).length;
  const hasDiff = Boolean(cashDiff) || diffLines > 0;
  const ready = preview && num(declared) !== null && missing === 0 && (!hasDiff || reason.trim().length >= 3);

  async function doClose() {
    const ok = await confirm({
      title: tr('تأكيد إقفال اليوم', 'Confirm day closing'),
      message: tr(
        `سيتم إقفال ${date} وترحيل القيود. فرق النقدية: ${cashDiff?.toFixed(2)} — أصناف بها فروق: ${diffLines}. لا يمكن التراجع إلا بقيود عكسية.`,
        `This closes ${date} and posts the entries. Cash difference: ${cashDiff?.toFixed(2)} — products with a difference: ${diffLines}. It can only be undone with reversing entries.`,
      ),
      confirmLabel: tr('إقفال', 'Close'),
      danger: Boolean(cashDiff) || diffLines > 0,
    });
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      await post(`representatives/${rep.id}/close-day`, {
        date,
        declaredCash: String(num(declared)),
        counts: lines.map((l) => ({ productId: l.productId, quantity: String(num(counts[l.productId] ?? '')) })),
        ...(hasDiff ? { differenceReason: reason.trim() } : {}),
      });
      toast.success(tr('تم إقفال اليوم', 'Day closed'));
      onClosed();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Input type="date" dir="ltr" value={date} max={today()} onChange={(e) => { setDate(e.target.value); setPreview(null); }} style={{ width: 160 }} />
        <Button loading={busy && !preview} onClick={loadPreview}>{tr('معاينة', 'Preview')}</Button>
      </div>
      <ErrorNote error={err} />
      {preview ? (
        <>
          <SummaryStrip items={[
            { label: tr('النقدية المتوقعة', 'Expected cash'), value: <Money value={preview.expectedCash} bold /> },
            { label: tr('مبيعات نقدية', 'Cash sales'), value: <Money value={preview.salesCash} /> },
            { label: tr('مبيعات آجلة', 'Credit sales'), value: <Money value={preview.salesCredit} /> },
            { label: tr('التحصيلات', 'Collections'), value: <Money value={preview.collections} /> },
          ]} />
          <div className="mt-16">
            <Field label={tr('النقدية الفعلية المسلّمة', 'Actual cash counted')} required hint={cashDiff === null ? undefined : `${tr('الفرق', 'Difference')}: ${cashDiff.toFixed(2)}`}>
              <Input type="number" min="0" step="0.01" dir="ltr" value={declared} onChange={(e) => setDeclared(e.target.value)} />
            </Field>
          </div>
          <div className="table-wrap mt-16">
            <table className="table">
              <thead><tr><th>{tr('الصنف', 'Product')}</th><th>{tr('المتوقع', 'Expected')}</th><th>{tr('المعدود فعلياً', 'Counted')}</th><th>{tr('الفرق', 'Diff')}</th></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const c = num(counts[l.productId] ?? '');
                  const diff = c === null ? null : c - Number(l.expectedQty);
                  return (
                    <tr key={l.productId}>
                      <td>{(l.product && (lang === 'ar' ? l.product.nameAr : l.product.nameEn)) || l.productId}</td>
                      <td><Qty value={l.expectedQty} /></td>
                      <td><Input type="number" min="0" step="0.0001" dir="ltr" value={counts[l.productId] ?? ''} onChange={(e) => setCounts({ ...counts, [l.productId]: e.target.value })} /></td>
                      <td>{diff === null ? '—' : <Badge tone={diff === 0 ? 'ok' : 'danger'}>{diff}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasDiff ? (
            <div className="mt-16">
              <Field label={tr('سبب الفرق (إلزامي)', 'Reason for the difference (required)')} required hint={tr('يُسجَّل مع الإقفال ويظهر في السجل', 'Stored with the closing')}>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
          ) : null}
          <div className="page-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <Button loading={busy} disabled={!ready} onClick={doClose}>{tr('إقفال اليوم', 'Close day')}</Button>
          </div>
        </>
      ) : null}
    </>
  );
}

function HistoryTab({ repId }: { repId: string }) {
  const { tr } = useApp();
  const [page, setPage] = useState(1);
  const { data, error, loading } = usePaged<ClosingRow>(`representatives/${repId}/closings?${queryString({ page, pageSize: 10 })}`);
  if (loading && !data) return <Loading />;
  return (
    <>
      <ErrorNote error={error} />
      <DataTable<ClosingRow>
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'd', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.closingDate} /> },
          { key: 'sc', header: tr('مبيعات نقدية', 'Cash sales'), align: 'end', render: (r) => <Money value={r.salesCash} /> },
          { key: 'cr', header: tr('مبيعات آجلة', 'Credit sales'), align: 'end', render: (r) => <Money value={r.salesCredit} /> },
          { key: 'co', header: tr('التحصيلات', 'Collections'), align: 'end', render: (r) => <Money value={r.collections} /> },
          { key: 'cd', header: tr('فرق النقدية', 'Cash diff'), align: 'end', render: (r) => <Badge tone={Number(r.cashDifference) === 0 ? 'ok' : 'danger'}>{r.cashDifference}</Badge> },
          { key: 'sd', header: tr('فرق المخزون (قيمة)', 'Stock diff (value)'), align: 'end', render: (r) => <Badge tone={Number(r.stockDifferenceValue) === 0 ? 'ok' : 'danger'}>{r.stockDifferenceValue}</Badge> },
          { key: 'cm', header: tr('العمولة', 'Commission'), align: 'end', render: (r) => <Money value={r.commissionTotal} /> },
          { key: 'rs', header: tr('سبب الفرق', 'Reason'), render: (r) => r.differenceReason ?? '—' },
        ]}
        empty={<EmptyState title={tr('لا توجد إقفالات', 'No closings yet')} />}
      />
      {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </>
  );
}

function CommissionsTab({ repId }: { repId: string }) {
  const { tr } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const list = useApi<{ items: Commission[]; total: number; page: number; pageSize: number; unpaidTotal: string }>(`representatives/${repId}/commissions?${queryString({ page, pageSize: 15 })}`);
  const accounts = useOptions<{ id: string; code: string; nameAr: string; kind: string }>('financial-accounts', (a) => ({ value: a.id, label: `${a.nameAr} (${a.code})` }));
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    const ok = await confirm({
      title: tr('صرف العمولات المستحقة', 'Pay due commissions'),
      message: tr(`سيتم صرف ${list.data?.unpaidTotal ?? '0'} من الحساب المختار وترحيل قيد محاسبي.`, `${list.data?.unpaidTotal ?? '0'} will be paid from the selected account and a journal entry posted.`),
      confirmLabel: tr('صرف', 'Pay'),
    });
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      await post(`representatives/${repId}/commissions/pay`, { idempotencyKey: crypto.randomUUID(), date: today(), financialAccountId: accountId });
      toast.success(tr('تم صرف العمولات', 'Commissions paid'));
      list.reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const due = Number(list.data?.unpaidTotal ?? 0);
  return (
    <>
      <ErrorNote error={err ?? list.error} />
      <SummaryStrip items={[{ label: tr('إجمالي المستحق', 'Total due'), value: <Money value={list.data?.unpaidTotal ?? '0'} bold /> }]} />
      <div className="toolbar" style={{ margin: '12px 0' }}>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">{tr('اختر حساب الصرف…', 'Pay from…')}</option>
          {accounts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Button loading={busy} disabled={!accountId || due <= 0} onClick={pay}>{tr('صرف العمولات', 'Pay commissions')}</Button>
      </div>
      {list.loading && !list.data ? <Loading /> : (
        <DataTable<Commission>
          rows={list.data?.items ?? []}
          rowKey={(r) => r.id}
          columns={[
            { key: 'd', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.createdAt} /> },
            { key: 's', header: tr('المصدر', 'Source'), render: (r) => r.sourceType },
            { key: 'a', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} /> },
            { key: 'p', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.paidAt ? <Badge tone="ok">{tr('مدفوع', 'Paid')}</Badge> : <Badge tone="warn">{tr('مستحق', 'Due')}</Badge>) },
          ]}
          empty={<EmptyState title={tr('لا توجد عمولات', 'No commissions')} />}
        />
      )}
      {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
    </>
  );
}

function RulesTab() {
  const { tr } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const rules = useApi<Rule[]>('representatives/commission-rules');
  const reps = useOptions<Rep>('representatives?pageSize=100', (r) => ({ value: r.id, label: `${r.nameAr} (${r.code})` }));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ basis: 'SALES', ratePercent: '', representativeId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const basis = useMemo(() => BASIS_LABEL(tr), [tr]);
  const repName = (id: string | null) => (id ? reps.options.find((o) => o.value === id)?.label ?? id : tr('كل المناديب', 'All representatives'));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post('representatives/commission-rules', { basis: form.basis, ratePercent: form.ratePercent, ...(form.representativeId ? { representativeId: form.representativeId } : {}) });
      toast.success(tr('تمت إضافة القاعدة', 'Rule added'));
      setOpen(false); setForm({ basis: 'SALES', ratePercent: '', representativeId: '' });
      rules.reload();
    } catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  async function deactivate(r: Rule) {
    const ok = await confirm({ title: tr('إيقاف القاعدة', 'Deactivate rule'), message: tr('لن تُحتسب بعد الآن على العمليات الجديدة. العمولات السابقة لا تتغير.', 'It will no longer apply to new transactions. Past commissions are unchanged.'), confirmLabel: tr('إيقاف', 'Deactivate'), danger: true });
    if (!ok) return;
    try { await post(`representatives/commission-rules/${r.id}/deactivate`); toast.success(tr('تم الإيقاف', 'Deactivated')); rules.reload(); }
    catch (e) { toast.failure((e as Error).message); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12 }}>
        <Button icon="plus" onClick={() => setOpen(true)}>{tr('قاعدة جديدة', 'New rule')}</Button>
      </div>
      <ErrorNote error={rules.error} />
      {rules.loading && !rules.data ? <Loading /> : (
        <DataTable<Rule>
          rows={rules.data ?? []}
          rowKey={(r) => r.id}
          columns={[
            { key: 'b', header: tr('الأساس', 'Basis'), render: (r) => basis[r.basis] },
            { key: 'r', header: tr('النسبة %', 'Rate %'), align: 'end', render: (r) => r.ratePercent },
            { key: 'w', header: tr('المندوب', 'Representative'), render: (r) => repName(r.representativeId) },
            { key: 'c', header: tr('أُنشئت', 'Created'), render: (r) => <DateText value={r.createdAt} /> },
            { key: 'x', header: '', align: 'center', render: (r) => <IconButton icon="x" title={tr('إيقاف', 'Deactivate')} danger onClick={() => deactivate(r)} /> },
          ]}
          empty={<EmptyState title={tr('لا توجد قواعد عمولات', 'No commission rules')} />}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr('قاعدة عمولة جديدة', 'New commission rule')}
        footer={<Button type="submit" form="rule-form" loading={busy}>{tr('حفظ', 'Save')}</Button>}>
        <form id="rule-form" onSubmit={create}>
          <ErrorNote error={err} />
          <div className="form-grid">
            <Field label={tr('أساس الحساب', 'Basis')} required className="col-6">
              <Select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>
                {Object.entries(basis).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label={tr('النسبة %', 'Rate %')} required className="col-6" hint={tr('مثال: 2.5 — حتى 100', 'e.g. 2.5 — up to 100')}>
              <Input type="number" min="0" max="100" step="0.0001" dir="ltr" required value={form.ratePercent} onChange={(e) => setForm({ ...form, ratePercent: e.target.value })} />
            </Field>
            <Field label={tr('المندوب', 'Representative')} className="col-12" hint={tr('اتركه فارغاً لتطبيق القاعدة على الجميع', 'Leave empty to apply to everyone')}>
              <Select value={form.representativeId} onChange={(e) => setForm({ ...form, representativeId: e.target.value })}>
                <option value="">{tr('كل المناديب', 'All representatives')}</option>
                {reps.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
