'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, CardHead, DataTable, DateText, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Pagination, Qty, Select, Tabs, Textarea } from '@/components/ui';
import { ResourcePage } from '@/components/ResourcePage';
import { useApi, usePaged } from '@/lib/hooks';
import { post, uuid } from '@/lib/api';
import { queryString, today } from '@/lib/format';

export default function HrPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'employees' | 'attendance' | 'leaves' | 'advances' | 'payroll'>('employees');
  return (
    <>
      <PageHeader title={tr('الموارد البشرية', 'Human resources')} sub={tr('الموظفون والحضور والاجازات والسلف والمرتبات', 'Employees, attendance, leave, advances and payroll')} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'employees', label: tr('الموظفون', 'Employees') },
          { id: 'attendance', label: tr('الحضور', 'Attendance') },
          { id: 'leaves', label: tr('الإجازات', 'Leave') },
          { id: 'advances', label: tr('السلف', 'Advances') },
          { id: 'payroll', label: tr('المرتبات', 'Payroll') },
        ]} />
      </div>
      {tab === 'employees' ? <EmployeesTab /> : null}
      {tab === 'attendance' ? <AttendanceTab /> : null}
      {tab === 'leaves' ? <LeavesTab /> : null}
      {tab === 'advances' ? <AdvancesTab /> : null}
      {tab === 'payroll' ? <PayrollTab /> : null}
    </>
  );
}

/* ---------------- employees ---------------- */

function EmployeesTab() {
  const { tr, lang } = useApp();
  const users = useApi<{ items: { id: string; fullName: string; email: string }[] }>('users?pageSize=100');
  return (
    <ResourcePage<any>
      title={tr('الموظفون', 'Employees')}
      endpoint="hr/employees"
      searchPlaceholder={tr('ابحث بالاسم أو الكود…', 'Search name or code…')}
      columns={[
        { key: 'code', header: tr('الكود', 'Code'), width: '100px', render: (r) => <span className="tree-code">{r.code}</span> },
        { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr) },
        { key: 'job', header: tr('المسمى', 'Job title'), render: (r) => r.jobTitle || '—' },
        { key: 'salary', header: tr('الراتب الأساسي', 'Base salary'), align: 'end', render: (r) => <Money value={r.baseSalary} /> },
        { key: 'allowance', header: tr('البدلات', 'Allowance'), align: 'end', render: (r) => <Money value={r.allowance} /> },
        { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
      ]}
      fields={[
        { name: 'code', label: tr('الكود', 'Code'), required: true, hideInEdit: true, col: 'col-3' },
        { name: 'nameAr', label: tr('الاسم بالعربية', 'Arabic name'), required: true, col: 'col-5' },
        { name: 'nameEn', label: tr('الاسم بالإنجليزية', 'English name'), col: 'col-4' },
        { name: 'jobTitle', label: tr('المسمى الوظيفي', 'Job title'), col: 'col-4' },
        { name: 'phone', label: tr('الهاتف', 'Phone'), type: 'tel', col: 'col-4' },
        { name: 'hireDate', label: tr('تاريخ التعيين', 'Hire date'), type: 'date', required: true, hideInEdit: true, col: 'col-4' },
        { name: 'baseSalary', label: tr('الراتب الأساسي', 'Base salary'), type: 'money', required: true, col: 'col-4' },
        { name: 'allowance', label: tr('البدلات', 'Allowance'), type: 'money', col: 'col-4' },
        { name: 'userId', label: tr('المستخدم', 'User'), type: 'select', col: 'col-4', options: (users.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.email})` })) },
        { name: 'isActive', label: tr('نشط', 'Active'), type: 'checkbox', hideInCreate: true, col: 'col-4' },
      ]}
      createLabel={tr('موظف جديد', 'New employee')}
    />
  );
}

/* ---------------- attendance ---------------- */

function AttendanceTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [employeeId, setEmployeeId] = useState('');
  const employees = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('hr/employees?pageSize=100');
  const { data, error, loading, reload } = useApi<any[]>(`hr/attendance?period=${period}${employeeId ? `&employeeId=${employeeId}` : ''}`);
  const [form, setForm] = useState({ employeeId: '', date: today(), status: 'PRESENT', checkIn: '', checkOut: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      const payload: Record<string, unknown> = { employeeId: form.employeeId, date: form.date, status: form.status };
      if (form.checkIn) payload.checkIn = form.checkIn;
      if (form.checkOut) payload.checkOut = form.checkOut;
      if (form.note) payload.note = form.note;
      await post('hr/attendance', payload);
      toast.success(tr('تم تسجيل الحضور', 'Attendance recorded'));
      setForm({ ...form, note: '' });
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <CardHead title={tr('تسجيل حضور', 'Record attendance')} />
        <form onSubmit={submit} className="form-grid" style={{ padding: 16 }}>
          <Field label={tr('الموظف', 'Employee')} required className="col-4">
            <Select value={form.employeeId} required onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">—</option>
              {(employees.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.nameAr}</option>)}
            </Select>
          </Field>
          <Field label={tr('التاريخ', 'Date')} required className="col-3"><Input type="date" dir="ltr" value={form.date} required onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label={tr('الحالة', 'Status')} required className="col-3">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="PRESENT">{tr('حاضر', 'Present')}</option>
              <option value="LATE">{tr('متأخر', 'Late')}</option>
              <option value="ABSENT">{tr('غائب', 'Absent')}</option>
              <option value="ON_LEAVE">{tr('في إجازة', 'On leave')}</option>
            </Select>
          </Field>
          <Field label={tr('دخول', 'Check-in')} className="col-2"><Input type="datetime-local" dir="ltr" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></Field>
          <Field label={tr('خروج', 'Check-out')} className="col-2"><Input type="datetime-local" dir="ltr" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></Field>
          <Field label={tr('ملاحظات', 'Notes')} className="col-6"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="col-6" style={{ display: 'flex', alignItems: 'end' }}>
            <Button type="submit" loading={busy} icon="save">{tr('تسجيل', 'Record')}</Button>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Card>
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 160 }} dir="ltr" />
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            <option value="">{tr('كل الموظفين', 'All employees')}</option>
            {(employees.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.nameAr}</option>)}
          </Select>
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <DataTable<any>
            rows={data}
            rowKey={(r, i) => r.id ?? String(i)}
            columns={[
              { key: 'emp', header: tr('الموظف', 'Employee'), render: (r) => r.employee?.nameAr ?? r.employeeId },
              { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.date} /> },
              { key: 'status', header: tr('الحالة', 'Status'), render: (r) => r.status },
              { key: 'in', header: tr('دخول', 'Check-in'), render: (r) => r.checkIn ? <DateText value={r.checkIn} /> : '—' },
              { key: 'out', header: tr('خروج', 'Check-out'), render: (r) => r.checkOut ? <DateText value={r.checkOut} /> : '—' },
            ]}
            empty={<EmptyState title={tr('لا توجد سجلات', 'No records')} />}
          />
        ) : null}
      </Card>
    </>
  );
}

/* ---------------- leaves ---------------- */

function LeavesTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const employees = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('hr/employees?pageSize=100');
  const path = useMemo(() => `hr/leaves${queryString({ page, pageSize, status })}`, [page, pageSize, status]);
  const { data, error, loading, reload } = usePaged<any>(path);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line
  const [form, setForm] = useState({ employeeId: '', type: 'ANNUAL', fromDate: today(), toDate: today(), reason: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      await post('hr/leaves', form);
      toast.success(tr('تم تقديم طلب الإجازة', 'Leave requested'));
      setCreating(false);
      setRefreshKey((n) => n + 1);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function decide(id: string, approve: boolean) {
    try {
      await post(`hr/leaves/${id}/decide`, { approve });
      toast.success(tr('تم اتخاذ القرار', 'Decision recorded'));
      setRefreshKey((n) => n + 1);
    } catch (e) { toast.failure((e as Error).message); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('طلب إجازة', 'Request leave')}</Button>
      </div>
      <Card>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">{tr('كل الحالات', 'All statuses')}</option>
            <option value="PENDING">{tr('معلق', 'Pending')}</option>
            <option value="APPROVED">{tr('معتمد', 'Approved')}</option>
            <option value="REJECTED">{tr('مرفوض', 'Rejected')}</option>
          </Select>
        </div>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<any>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'emp', header: tr('الموظف', 'Employee'), render: (r) => r.employee?.nameAr ?? r.employeeId },
                { key: 'type', header: tr('النوع', 'Type'), render: (r) => r.type },
                { key: 'from', header: tr('من', 'From'), render: (r) => <DateText value={r.fromDate} /> },
                { key: 'to', header: tr('إلى', 'To'), render: (r) => <DateText value={r.toDate} /> },
                { key: 'status', header: tr('الحالة', 'Status'), render: (r) => r.status },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => r.status === 'PENDING' ? (
                    <div className="row-actions">
                      <IconButton icon="check" title={tr('اعتماد', 'Approve')} onClick={() => decide(r.id, true)} />
                      <IconButton icon="x" danger title={tr('رفض', 'Reject')} onClick={() => decide(r.id, false)} />
                    </div>
                  ) : null,
                },
              ]}
              empty={<EmptyState title={tr('لا توجد طلبات', 'No requests')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('طلب إجازة', 'Leave request')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="lv-form" loading={busy} icon="save">{tr('تقديم', 'Submit')}</Button>
        </>
      }>
        <form id="lv-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label={tr('الموظف', 'Employee')} required className="col-6">
              <Select value={form.employeeId} required onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">—</option>
                {(employees.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('النوع', 'Type')} required className="col-6">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="ANNUAL">{tr('سنوية', 'Annual')}</option>
                <option value="SICK">{tr('مرضية', 'Sick')}</option>
                <option value="UNPAID">{tr('بدون راتب', 'Unpaid')}</option>
              </Select>
            </Field>
            <Field label={tr('من تاريخ', 'From')} required className="col-6"><Input type="date" dir="ltr" value={form.fromDate} required onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></Field>
            <Field label={tr('إلى تاريخ', 'To')} required className="col-6"><Input type="date" dir="ltr" value={form.toDate} required onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></Field>
            <Field label={tr('السبب', 'Reason')} className="col-12"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}

/* ---------------- advances ---------------- */

function AdvancesTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const employees = useApi<{ items: { id: string; code: string; nameAr: string }[] }>('hr/employees?pageSize=100');
  const accounts = useApi<any[]>('financial-accounts');
  const { data, error, loading, reload } = usePaged<any>(`hr/advances?${queryString({ page, pageSize })}`);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line
  const [form, setForm] = useState({ employeeId: '', amount: '', monthlyDeduction: '', date: today(), financialAccountId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      await post('hr/advances', { idempotencyKey: uuid(), employeeId: form.employeeId, amount: form.amount, monthlyDeduction: form.monthlyDeduction, date: form.date, financialAccountId: form.financialAccountId, note: form.note || undefined });
      toast.success(tr('تم منح السلفة', 'Advance granted'));
      setCreating(false);
      setRefreshKey((n) => n + 1);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('سلفة جديدة', 'New advance')}</Button>
      </div>
      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<any>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'emp', header: tr('الموظف', 'Employee'), render: (r) => r.employee?.nameAr ?? r.employeeId },
                { key: 'amount', header: tr('المبلغ', 'Amount'), align: 'end', render: (r) => <Money value={r.amount} /> },
                { key: 'ded', header: tr('الخصم الشهري', 'Monthly deduction'), align: 'end', render: (r) => <Money value={r.monthlyDeduction} /> },
                { key: 'remaining', header: tr('المتبقي', 'Remaining'), align: 'end', render: (r) => <Money value={r.remaining ?? r.amount} /> },
                { key: 'date', header: tr('التاريخ', 'Date'), render: (r) => <DateText value={r.date} /> },
                { key: 'status', header: tr('الحالة', 'Status'), render: (r) => r.status },
              ]}
              empty={<EmptyState title={tr('لا توجد سلف', 'No advances')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('سلفة موظف', 'Employee advance')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="ad-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="ad-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label={tr('الموظف', 'Employee')} required className="col-6">
              <Select value={form.employeeId} required onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">—</option>
                {(employees.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('الحساب', 'Account')} required className="col-6">
              <Select value={form.financialAccountId} required onChange={(e) => setForm({ ...form, financialAccountId: e.target.value })}>
                <option value="">—</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('المبلغ', 'Amount')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={form.amount} required onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={tr('الخصم الشهري', 'Monthly deduction')} required className="col-4"><Input type="number" min="0.01" step="0.01" dir="ltr" value={form.monthlyDeduction} required onChange={(e) => setForm({ ...form, monthlyDeduction: e.target.value })} /></Field>
            <Field label={tr('التاريخ', 'Date')} required className="col-4"><Input type="date" dir="ltr" value={form.date} required onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label={tr('ملاحظات', 'Notes')} className="col-12"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}

/* ---------------- payroll ---------------- */

function PayrollTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const runs = useApi<any[]>('hr/payroll');
  const accounts = useApi<any[]>('financial-accounts');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payDate, setPayDate] = useState(today());

  async function runPayroll() {
    setBusy(true); setFerr(null);
    try {
      await post('hr/payroll', { period });
      toast.success(tr('تم تشغيل المرتبات', 'Payroll run completed'));
      runs.reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function payRun() {
    setBusy(true); setFerr(null);
    try {
      await post(`hr/payroll/${payId}/pay`, { financialAccountId: payAccount, date: payDate });
      toast.success(tr('تم صرف المرتبات', 'Payroll paid'));
      setPayId(null);
      runs.reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ padding: '12px 16px 0' }}>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 160 }} dir="ltr" />
          <Button loading={busy} icon="refresh" onClick={runPayroll}>{tr('تشغيل المرتبات', 'Run payroll')}</Button>
        </div>
        <ErrorNote error={ferr} />
      </Card>
      <Card>
        {runs.loading && !runs.data ? <Loading /> : null}
        <ErrorNote error={runs.error} />
        {runs.data ? (
          <DataTable<any>
            rows={runs.data}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            columns={[
              { key: 'period', header: tr('الفترة', 'Period'), render: (r) => <span className="mono">{r.period}</span> },
              { key: 'gross', header: tr('الإجمالي', 'Gross'), align: 'end', render: (r) => <Money value={r.totalGross} /> },
              { key: 'ded', header: tr('الخصومات', 'Deductions'), align: 'end', render: (r) => <Money value={r.totalDeductions} /> },
              { key: 'net', header: tr('الصافي', 'Net'), align: 'end', render: (r) => <Money value={r.totalNet} bold /> },
              { key: 'status', header: tr('الحالة', 'Status'), render: (r) => r.status },
              {
                key: 'actions',
                header: '',
                align: 'end',
                width: '1%',
                render: (r) => r.status !== 'PAID' ? <Button size="sm" onClick={(e) => { e.stopPropagation(); setPayId(r.id); setPayDate(today()); }}>{tr('صرف', 'Pay')}</Button> : null,
              },
            ]}
            empty={<EmptyState title={tr('لا توجد مسيرات', 'No payroll runs')} />}
          />
        ) : null}
      </Card>

      {detailId ? <PayrollDetailModal id={detailId} onClose={() => setDetailId(null)} /> : null}

      <Modal open={Boolean(payId)} onClose={() => setPayId(null)} title={tr('صرف المرتبات', 'Pay payroll')} footer={
        <>
          <Button variant="ghost" onClick={() => setPayId(null)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button loading={busy} onClick={payRun}>{tr('صرف', 'Pay')}</Button>
        </>
      }>
        <div className="form-grid">
          <Field label={tr('الحساب', 'Account')} required className="col-6">
            <Select value={payAccount} required onChange={(e) => setPayAccount(e.target.value)}>
              <option value="">—</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.nameAr}</option>)}
            </Select>
          </Field>
          <Field label={tr('التاريخ', 'Date')} required className="col-6"><Input type="date" dir="ltr" value={payDate} required onChange={(e) => setPayDate(e.target.value)} /></Field>
        </div>
        <ErrorNote error={ferr} />
      </Modal>
    </>
  );
}

function PayrollDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { tr, lang } = useApp();
  const { data, error, loading } = useApi<any>(`hr/payroll/${id}`);
  return (
    <Modal open onClose={onClose} title={tr('تفاصيل المرتبات', 'Payroll details')} size="xl">
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <DataTable<any>
          rows={data.lines ?? []}
          rowKey={(r, i) => r.id ?? String(i)}
          columns={[
            { key: 'emp', header: tr('الموظف', 'Employee'), render: (r) => r.employee ? (lang === 'ar' ? r.employee.nameAr : r.employee.nameEn || r.employee.nameAr) : r.employeeId },
            { key: 'gross', header: tr('الإجمالي', 'Gross'), align: 'end', render: (r) => <Money value={r.gross} /> },
            { key: 'allow', header: tr('البدلات', 'Allowance'), align: 'end', render: (r) => <Money value={r.allowance} /> },
            { key: 'ded', header: tr('الخصومات', 'Deductions'), align: 'end', render: (r) => <Money value={r.deductions} /> },
            { key: 'net', header: tr('الصافي', 'Net'), align: 'end', render: (r) => <Money value={r.net} bold /> },
          ]}
          empty={<EmptyState />}
        />
      ) : null}
    </Modal>
  );
}
