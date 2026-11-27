'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DateText,
  DetailGrid,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Loading,
  Modal,
  Money,
  PageHeader,
  Pagination,
  Qty,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';
import { useApi, usePaged } from '@/lib/hooks';
import { get, post, uuid } from '@/lib/api';
import { queryString, today } from '@/lib/format';

interface FinAcc { id: string; code: string; kind: 'CASHBOX' | 'BANK'; nameAr: string; nameEn: string; bankName?: string | null; accountNumber?: string | null; balance: string }
interface Voucher {
  id: string; number: number; type: 'RECEIPT' | 'PAYMENT' | 'TRANSFER'; date: string; amount: string; status: string;
  description: string; financialAccountId: string; toFinancialAccountId?: string | null; partyType?: string | null; partyId?: string | null;
  financialAccount?: { code: string; nameAr: string }; representativeId?: string | null;
}
interface Cheque {
  id: string; number?: number; chequeNumber: string; bankName: string; direction: 'INCOMING' | 'OUTGOING'; status: string;
  amount: string; receivedDate?: string; issueDate?: string; dueDate: string; customerId?: string; supplierId?: string;
  customer?: { code: string; nameAr: string }; supplier?: { code: string; nameAr: string };
}

export default function TreasuryPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'accounts' | 'vouchers' | 'cheques' | 'recon'>('accounts');
  return (
    <>
      <PageHeader title={tr('الخزينة والبنوك', 'Treasury & banks')} sub={tr('السندات والشيكات والتسوية البنكية', 'Vouchers, cheques and bank reconciliation')}>
      </PageHeader>
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'accounts', label: tr('الخزائن والبنوك', 'Cash & banks') },
          { id: 'vouchers', label: tr('السندات', 'Vouchers') },
          { id: 'cheques', label: tr('الشيكات', 'Cheques') },
          { id: 'recon', label: tr('التسوية البنكية', 'Reconciliation') },
        ]} />
      </div>
      {tab === 'accounts' ? <AccountsTab /> : null}
      {tab === 'vouchers' ? <VouchersTab /> : null}
      {tab === 'cheques' ? <ChequesTab /> : null}
      {tab === 'recon' ? <ReconTab /> : null}
    </>
  );
}

/* ---------------- accounts ---------------- */

function AccountsTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<FinAcc[]>('financial-accounts');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', kind: 'CASHBOX', nameAr: '', nameEn: '', bankName: '', accountNumber: '', openingBalance: '', openingDate: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  useEffect(() => {
    if (creating) setForm({ code: '', kind: 'CASHBOX', nameAr: '', nameEn: '', bankName: '', accountNumber: '', openingBalance: '', openingDate: '' });
  }, [creating]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      const payload: Record<string, unknown> = { code: form.code, kind: form.kind, nameAr: form.nameAr, nameEn: form.nameEn };
      if (form.bankName) payload.bankName = form.bankName;
      if (form.accountNumber) payload.accountNumber = form.accountNumber;
      if (form.openingBalance) payload.openingBalance = form.openingBalance;
      if (form.openingDate) payload.openingDate = form.openingDate;
      await post('financial-accounts', payload);
      toast.success(tr('تم حفظ الحساب', 'Account saved'));
      setCreating(false);
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('حساب جديد', 'New account')}</Button>
      </div>
      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <DataTable<FinAcc>
            rows={data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
              { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
              { key: 'kind', header: tr('النوع', 'Type'), render: (r) => <Badge tone={r.kind === 'BANK' ? 'info' : 'ok'}>{r.kind === 'BANK' ? tr('بنك', 'Bank') : tr('خزينة', 'Cashbox')}</Badge> },
              { key: 'bank', header: tr('البنك / الرقم', 'Bank / number'), render: (r) => r.bankName ? `${r.bankName} · ${r.accountNumber ?? ''}` : '—' },
              { key: 'balance', header: tr('الرصيد', 'Balance'), align: 'end', render: (r) => <Money value={r.balance} bold /> },
            ]}
            empty={<EmptyState title={tr('لا توجد حسابات', 'No accounts')} />}
          />
        ) : null}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title={tr('حساب خزينة / بنك جديد', 'New cash/bank account')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="acc-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="acc-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label={tr('الكود', 'Code')} required className="col-4"><Input value={form.code} required onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label={tr('النوع', 'Type')} required className="col-4">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="CASHBOX">{tr('خزينة', 'Cashbox')}</option>
                <option value="BANK">{tr('بنك', 'Bank')}</option>
              </Select>
            </Field>
            <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-4"><Input value={form.nameAr} required onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
            <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-4"><Input value={form.nameEn} required onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
            {form.kind === 'BANK' ? (
              <>
                <Field label={tr('اسم البنك', 'Bank name')} className="col-4"><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></Field>
                <Field label={tr('رقم الحساب', 'Account number')} className="col-4"><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} dir="ltr" /></Field>
              </>
            ) : null}
            <Field label={tr('رصيد افتتاحي', 'Opening balance')} className="col-4"><Input type="number" min="0" step="0.01" dir="ltr" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></Field>
            <Field label={tr('تاريخ الافتتاح', 'Opening date')} className="col-4"><Input type="date" dir="ltr" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}

/* ---------------- vouchers ---------------- */

function VouchersTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Voucher | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const path = useMemo(() => `treasury/vouchers${queryString({ page, pageSize, type, status, from, to })}`, [page, pageSize, type, status, from, to]);
  const { data, error, loading, reload } = usePaged<Voucher>(path);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="receipt" onClick={() => setCreating(true)}>{tr('سند جديد', 'New voucher')}</Button>
      </div>
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">{tr('كل الأنواع', 'All types')}</option>
            <option value="RECEIPT">{tr('قبض', 'Receipt')}</option>
            <option value="PAYMENT">{tr('صرف', 'Payment')}</option>
            <option value="TRANSFER">{tr('تحويل', 'Transfer')}</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="POSTED">{tr('مرحّل', 'Posted')}</option>
            <option value="CANCELLED">{tr('ملغي', 'Cancelled')}</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} dir="ltr" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} dir="ltr" />
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<Voucher>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'no', header: tr('الرقم', 'No.'), width: '90px', render: (r) => <span className="mono fw-600">#{r.number}</span> },
                { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.date} />, width: '105px' },
                { key: 'type', header: tr('النوع', 'Type'), render: (r) => <Badge tone={r.type === 'RECEIPT' ? 'ok' : r.type === 'PAYMENT' ? 'warn' : 'info'}>{r.type === 'RECEIPT' ? tr('قبض', 'Receipt') : r.type === 'PAYMENT' ? tr('صرف', 'Payment') : tr('تحويل', 'Transfer')}</Badge> },
                { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.description },
                { key: 'amount', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} bold /> },
                { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.status === 'POSTED' ? <Badge tone="ok">{tr('مرحّل', 'Posted')}</Badge> : <Badge tone="danger">{tr('ملغي', 'Cancelled')}</Badge>) },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => r.status === 'POSTED' ? <IconButton icon="x" danger title={tr('إلغاء', 'Cancel')} onClick={() => setCancelTarget(r)} /> : null,
                },
              ]}
              empty={<EmptyState title={tr('لا توجد سندات', 'No vouchers')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <VoucherForm open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setRefreshKey((n) => n + 1); }} />
      <CancelVoucherModal voucher={cancelTarget} onClose={() => setCancelTarget(null)} onDone={() => { setCancelTarget(null); setRefreshKey((n) => n + 1); }} />
    </>
  );
}

function VoucherForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const accounts = useApi<FinAcc[]>('financial-accounts');
  const customers = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('customers?pageSize=100');
  const suppliers = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('suppliers?pageSize=100');
  const [type, setType] = useState<'RECEIPT' | 'PAYMENT' | 'TRANSFER'>('RECEIPT');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [toFinancialAccountId, setToFinancialAccountId] = useState('');
  const [partyType, setPartyType] = useState<'' | 'CUSTOMER' | 'SUPPLIER'>('');
  const [partyId, setPartyId] = useState('');
  const [counterAccountId, setCounterAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType('RECEIPT'); setDate(today()); setAmount(''); setFinancialAccountId(''); setToFinancialAccountId('');
    setPartyType(''); setPartyId(''); setCounterAccountId(''); setDescription(''); setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        idempotencyKey: uuid(),
        type,
        date,
        amount,
        financialAccountId,
        description,
      };
      if (type === 'TRANSFER' && toFinancialAccountId) payload.toFinancialAccountId = toFinancialAccountId;
      if (partyType) { payload.partyType = partyType; if (partyId) payload.partyId = partyId; }
      if (counterAccountId) payload.counterAccountId = counterAccountId;
      await post('treasury/vouchers', payload);
      toast.success(tr('تم حفظ السند', 'Voucher saved'));
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  const partyOptions = partyType === 'CUSTOMER' ? (customers.data?.items ?? []) : partyType === 'SUPPLIER' ? (suppliers.data?.items ?? []) : [];

  return (
    <Modal open={open} onClose={onClose} title={tr('سند قبض / صرف / تحويل', 'Receipt / payment / transfer voucher')} size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="v-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }
    >
      <form id="v-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('النوع', 'Type')} required className="col-4">
            <Select value={type} onChange={(e) => setType(e.target.value as 'RECEIPT' | 'PAYMENT' | 'TRANSFER')}>
              <option value="RECEIPT">{tr('قبض', 'Receipt')}</option>
              <option value="PAYMENT">{tr('صرف', 'Payment')}</option>
              <option value="TRANSFER">{tr('تحويل', 'Transfer')}</option>
            </Select>
          </Field>
          <Field label={tr('التاريخ', 'Date')} required className="col-4"><Input type="date" value={date} required dir="ltr" onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={tr('المبلغ', 'Amount')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={amount} required onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={type === 'RECEIPT' ? tr('إلى حساب', 'Into account') : tr('من حساب', 'From account')} required className="col-6">
            <Select value={financialAccountId} required onChange={(e) => setFinancialAccountId(e.target.value)}>
              <option value="">—</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
            </Select>
          </Field>
          {type === 'TRANSFER' ? (
            <Field label={tr('إلى حساب', 'To account')} required className="col-6">
              <Select value={toFinancialAccountId} required onChange={(e) => setToFinancialAccountId(e.target.value)}>
                <option value="">—</option>
                {(accounts.data ?? []).filter((a) => a.id !== financialAccountId).map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label={tr('نوع الطرف', 'Party type')} className="col-4">
            <Select value={partyType} onChange={(e) => { setPartyType(e.target.value as '' | 'CUSTOMER' | 'SUPPLIER'); setPartyId(''); }}>
              <option value="">—</option>
              <option value="CUSTOMER">{tr('عميل', 'Customer')}</option>
              <option value="SUPPLIER">{tr('مورد', 'Supplier')}</option>
            </Select>
          </Field>
          {partyType ? (
            <Field label={tr('الطرف', 'Party')} className="col-8">
              <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">—</option>
                {partyOptions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.nameAr}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label={tr('البيان', 'Description')} required className="col-12">
            <Textarea value={description} required onChange={(e) => setDescription(e.target.value)} placeholder={tr('سبب السند…', 'Voucher reason…')} />
          </Field>
        </div>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function CancelVoucherModal({ voucher, onClose, onDone }: { voucher: Voucher | null; onClose: () => void; onDone: () => void }) {
  const { tr } = useApp();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setReason(''), [voucher]);
  if (!voucher) return null;
  async function submit() {
    setBusy(true); setError(null);
    try {
      await post(`treasury/vouchers/${voucher!.id}/cancel`, { reason });
      toast.success(tr('تم إلغاء السند', 'Voucher cancelled'));
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`${tr('إلغاء سند', 'Cancel voucher')} #${voucher.number}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{tr('تراجع', 'Back')}</Button>
        <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={submit}>{tr('تأكيد', 'Confirm')}</Button>
      </>
    }>
      <Field label={tr('السبب', 'Reason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

/* ---------------- cheques ---------------- */

function ChequesTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState<'IN' | 'OUT' | null>(null);
  const [settleTarget, setSettleTarget] = useState<Cheque | null>(null);
  const [bounceTarget, setBounceTarget] = useState<Cheque | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const path = useMemo(() => `treasury/cheques${queryString({ page, pageSize, direction, status })}`, [page, pageSize, direction, status]);
  const { data, error, loading, reload } = usePaged<Cheque>(path);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end', gap: 8 }}>
        <Button icon="credit-card" onClick={() => setCreating('IN')}>{tr('استلام شيك', 'Receive cheque')}</Button>
        <Button variant="ghost" icon="credit-card" onClick={() => setCreating('OUT')}>{tr('إصدار شيك', 'Issue cheque')}</Button>
      </div>
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">{tr('كل الاتجاهات', 'All directions')}</option>
            <option value="INCOMING">{tr('وارد', 'Incoming')}</option>
            <option value="OUTGOING">{tr('صادر', 'Outgoing')}</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="UNDER_COLLECTION">{tr('تحت التحصيل', 'Under collection')}</option>
            <option value="COLLECTED">{tr('محصّل', 'Collected')}</option>
            <option value="BOUNCED">{tr('مرتد', 'Bounced')}</option>
            <option value="ISSUED">{tr('صادر', 'Issued')}</option>
            <option value="PAID">{tr('مدفوع', 'Paid')}</option>
          </Select>
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<Cheque>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'no', header: tr('رقم الشيك', 'Cheque #'), render: (r) => <span className="mono">{r.chequeNumber}</span> },
                { key: 'bank', header: tr('البنك', 'Bank'), render: (r) => r.bankName },
                { key: 'party', header: tr('الطرف', 'Party'), render: (r) => (r.customer ? r.customer.nameAr : r.supplier ? r.supplier.nameAr : '—') },
                { key: 'amount', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} bold /> },
                { key: 'due', header: tr('تاريخ الاستحقاق', 'Due date'), render: (r) => <DateText value={r.dueDate} /> },
                { key: 'status', header: tr('الحالة', 'Status'), render: (r) => <Badge tone={r.status === 'COLLECTED' || r.status === 'PAID' ? 'ok' : r.status === 'BOUNCED' ? 'danger' : 'warn'}>{r.status}</Badge> },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => (
                    <div className="row-actions">
                      {r.status === 'UNDER_COLLECTION' || r.status === 'ISSUED' ? (
                        <>
                          <IconButton icon="check" title={tr('تحصيل', 'Settle')} onClick={() => setSettleTarget(r)} />
                          <IconButton icon="x" danger title={tr('إرجاع', 'Bounce')} onClick={() => setBounceTarget(r)} />
                        </>
                      ) : null}
                    </div>
                  ),
                },
              ]}
              empty={<EmptyState title={tr('لا توجد شيكات', 'No cheques')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <IncomingChequeForm open={creating === 'IN'} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); setRefreshKey((n) => n + 1); }} />
      <OutgoingChequeForm open={creating === 'OUT'} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); setRefreshKey((n) => n + 1); }} />
      <SettleChequeModal cheque={settleTarget} onClose={() => setSettleTarget(null)} onDone={() => { setSettleTarget(null); setRefreshKey((n) => n + 1); }} />
      <BounceChequeModal cheque={bounceTarget} onClose={() => setBounceTarget(null)} onDone={() => { setBounceTarget(null); setRefreshKey((n) => n + 1); }} />
    </>
  );
}

function IncomingChequeForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr } = useApp();
  const toast = useToast();
  const customers = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('customers?pageSize=100');
  const [f, setF] = useState({ chequeNumber: '', bankName: '', receivedDate: today(), dueDate: today(), amount: '', customerId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setF({ chequeNumber: '', bankName: '', receivedDate: today(), dueDate: today(), amount: '', customerId: '', note: '' }); }, [open]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = { idempotencyKey: uuid(), chequeNumber: f.chequeNumber, bankName: f.bankName, receivedDate: f.receivedDate, dueDate: f.dueDate, amount: f.amount, customerId: f.customerId };
      if (f.note) payload.note = f.note;
      await post('treasury/cheques/incoming', payload);
      toast.success(tr('تم استلام الشيك', 'Cheque received'));
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('استلام شيك وارد', 'Receive incoming cheque')} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button><Button type="submit" form="ic-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button></>}>
      <form id="ic-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('رقم الشيك', 'Cheque number')} required className="col-4"><Input value={f.chequeNumber} required onChange={(e) => setF({ ...f, chequeNumber: e.target.value })} dir="ltr" /></Field>
          <Field label={tr('البنك', 'Bank')} required className="col-4"><Input value={f.bankName} required onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
          <Field label={tr('العميل', 'Customer')} required className="col-4">
            <Select value={f.customerId} required onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">—</option>
              {(customers.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.nameAr}</option>)}
            </Select>
          </Field>
          <Field label={tr('تاريخ الاستلام', 'Received date')} required className="col-4"><Input type="date" dir="ltr" value={f.receivedDate} required onChange={(e) => setF({ ...f, receivedDate: e.target.value })} /></Field>
          <Field label={tr('تاريخ الاستحقاق', 'Due date')} required className="col-4"><Input type="date" dir="ltr" value={f.dueDate} required onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label={tr('المبلغ', 'Amount')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={f.amount} required onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label={tr('ملاحظات', 'Notes')} className="col-12"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function OutgoingChequeForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr, lang } = useApp();
  const toast = useToast();
  const accounts = useApi<FinAcc[]>('financial-accounts');
  const suppliers = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('suppliers?pageSize=100');
  const [f, setF] = useState({ chequeNumber: '', issueDate: today(), dueDate: today(), amount: '', supplierId: '', financialAccountId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setF({ chequeNumber: '', issueDate: today(), dueDate: today(), amount: '', supplierId: '', financialAccountId: '', note: '' }); }, [open]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = { idempotencyKey: uuid(), chequeNumber: f.chequeNumber, issueDate: f.issueDate, dueDate: f.dueDate, amount: f.amount, supplierId: f.supplierId, financialAccountId: f.financialAccountId };
      if (f.note) payload.note = f.note;
      await post('treasury/cheques/outgoing', payload);
      toast.success(tr('تم إصدار الشيك', 'Cheque issued'));
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('إصدار شيك صادر', 'Issue outgoing cheque')} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button><Button type="submit" form="oc-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button></>}>
      <form id="oc-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr('رقم الشيك', 'Cheque number')} required className="col-4"><Input value={f.chequeNumber} required onChange={(e) => setF({ ...f, chequeNumber: e.target.value })} dir="ltr" /></Field>
          <Field label={tr('البنك (الحساب)', 'Bank account')} required className="col-4">
            <Select value={f.financialAccountId} required onChange={(e) => setF({ ...f, financialAccountId: e.target.value })}>
              <option value="">—</option>
              {(accounts.data ?? []).filter((a) => a.kind === 'BANK').map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={tr('المورد', 'Supplier')} required className="col-4">
            <Select value={f.supplierId} required onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
              <option value="">—</option>
              {(suppliers.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.nameAr}</option>)}
            </Select>
          </Field>
          <Field label={tr('تاريخ الإصدار', 'Issue date')} required className="col-4"><Input type="date" dir="ltr" value={f.issueDate} required onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
          <Field label={tr('تاريخ الاستحقاق', 'Due date')} required className="col-4"><Input type="date" dir="ltr" value={f.dueDate} required onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label={tr('المبلغ', 'Amount')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={f.amount} required onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label={tr('ملاحظات', 'Notes')} className="col-12"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function SettleChequeModal({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { tr } = useApp();
  const toast = useToast();
  const accounts = useApi<FinAcc[]>('financial-accounts');
  const [date, setDate] = useState(today());
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (cheque) { setDate(today()); setFinancialAccountId(''); } }, [cheque]);
  if (!cheque) return null;
  async function submit() {
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = { date };
      if (financialAccountId) payload.financialAccountId = financialAccountId;
      await post(`treasury/cheques/${cheque!.id}/settle`, payload);
      toast.success(tr('تم تحصيل الشيك', 'Cheque settled'));
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`${tr('تحصيل شيك', 'Settle cheque')} ${cheque.chequeNumber}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
        <Button loading={busy} onClick={submit}>{tr('تأكيد', 'Confirm')}</Button>
      </>
    }>
      <div className="form-grid">
        <Field label={tr('التاريخ', 'Date')} required className="col-6"><Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={tr('حساب البنك (وارد)', 'Bank account (incoming)')} className="col-6">
          <Select value={financialAccountId} onChange={(e) => setFinancialAccountId(e.target.value)}>
            <option value="">—</option>
            {(accounts.data ?? []).filter((a) => a.kind === 'BANK').map((a) => <option key={a.id} value={a.id}>{a.code} · {a.nameAr}</option>)}
          </Select>
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function BounceChequeModal({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { tr } = useApp();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (cheque) { setDate(today()); setReason(''); } }, [cheque]);
  if (!cheque) return null;
  async function submit() {
    setBusy(true); setError(null);
    try {
      await post(`treasury/cheques/${cheque!.id}/bounce`, { date, reason });
      toast.success(tr('تم إرجاع الشيك', 'Cheque bounced'));
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`${tr('إرجاع شيك', 'Bounce cheque')} ${cheque.chequeNumber}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button>
        <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={submit}>{tr('تأكيد', 'Confirm')}</Button>
      </>
    }>
      <div className="form-grid">
        <Field label={tr('التاريخ', 'Date')} required className="col-4"><Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={tr('السبب', 'Reason')} required className="col-8"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

/* ---------------- reconciliation ---------------- */

function ReconTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const accounts = useApi<FinAcc[]>('financial-accounts');
  const [bankId, setBankId] = useState('');
  const [statementDate, setStatementDate] = useState(today());
  const [statementBalance, setStatementBalance] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);

  const bankAccounts = (accounts.data ?? []).filter((a) => a.kind === 'BANK');
  const unrecon = useApi<{ items?: { id: string; entryDate: string; description: string; debit: string; credit: string }[] }>(bankId ? `banks/${bankId}/unreconciled?pageSize=200` : null);

  useEffect(() => {
    if (!bankId) { setHistory([]); return; }
    let stale = false;
    get<any>(`banks/${bankId}/reconciliations`).then((d) => { if (!stale) setHistory(Array.isArray(d) ? d : d?.items ?? []); }).catch((e: Error) => { if (!stale) { setHistory([]); toast.failure(e.message); } });
    return () => { stale = true; };
  }, [bankId]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await post(`banks/${bankId}/reconcile`, { statementDate, statementBalance, journalLineIds: [...selected] });
      toast.success(tr('تمت التسوية', 'Reconciliation completed'));
      setSelected(new Set());
      unrecon.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="form-grid" style={{ padding: 16 }}>
        <Field label={tr('الحساب البنكي', 'Bank account')} required className="col-4">
          <Select value={bankId} onChange={(e) => { setBankId(e.target.value); setSelected(new Set()); }}>
            <option value="">—</option>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
          </Select>
        </Field>
        <Field label={tr('تاريخ كشف الحساب', 'Statement date')} required className="col-4">
          <Input type="date" dir="ltr" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
        </Field>
        <Field label={tr('رصيد كشف الحساب', 'Statement balance')} required className="col-4">
          <Input type="number" step="0.01" dir="ltr" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} />
        </Field>
      </div>
      {bankId ? (
        <>
          <div className="hint" style={{ padding: '0 16px 8px' }}>
            {tr('حدّد بنود دفتر اليومية غير المسوّاة. يجب أن يساوي مجموعها فرق رصيد كشف الحساب.', 'Select unreconciled journal lines. Their sum must equal the statement balance difference.')}
          </div>
          <ErrorNote error={error} />
          {unrecon.loading && !unrecon.data ? <Loading /> : null}
          {(unrecon.data?.items ?? []).length ? (
            <DataTable<{ id: string; entryDate: string; description: string; debit: string; credit: string }>
              rows={unrecon.data?.items ?? []}
              rowKey={(r) => r.id}
              columns={[
                { key: 'sel', header: '', width: '40px', render: (r) => <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /> },
                { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.entryDate} /> },
                { key: 'desc', header: tr('البيان', 'Description'), render: (r) => r.description },
                { key: 'debit', header: tr('مدين', 'Debit'), align: 'end', render: (r) => <Money value={r.debit} /> },
                { key: 'credit', header: tr('دائن', 'Credit'), align: 'end', render: (r) => <Money value={r.credit} /> },
              ]}
              empty={<EmptyState title={tr('لا توجد بنود غير مسوّاة', 'No unreconciled items')} />}
            />
          ) : (
            <div className="empty">{tr('لا توجد بنود غير مسوّاة', 'No unreconciled items')}</div>
          )}
          <div className="page-actions" style={{ padding: 16, justifyContent: 'flex-end' }}>
            <span className="muted">{tr('المحدّد', 'Selected')}: {selected.size}</span>
            <Button loading={busy} disabled={selected.size === 0 || !statementBalance} onClick={submit}>{tr('تسوية', 'Reconcile')}</Button>
          </div>
          {history.length ? (
            <>
              <div className="section-title" style={{ padding: '0 16px' }}>{tr('التسويات السابقة', 'Previous reconciliations')}</div>
              <DataTable<any>
                rows={history}
                rowKey={(r, i) => String(r.id ?? i)}
                columns={[
                  { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.statementDate ?? r.date} /> },
                  { key: 'balance', header: tr('الرصيد', 'Balance'), align: 'end', render: (r) => <Money value={r.statementBalance ?? r.balance} /> },
                ]}
                empty={<EmptyState />}
              />
            </>
          ) : null}
        </>
      ) : (
        <div className="empty" style={{ padding: 40 }}>{tr('اختر حسابًا بنكيًا', 'Choose a bank account')}</div>
      )}
    </Card>
  );
}
