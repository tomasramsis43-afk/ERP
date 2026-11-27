'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, DateText, DetailGrid, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { useApi, useOptions, usePaged } from '@/lib/hooks';
import { post, patch, put } from '@/lib/api';
import { queryString } from '@/lib/format';

interface User { id: string; email: string; fullName: string; isActive: boolean; locale: string; branch: { id: string; code: string; nameAr: string; nameEn: string } | null; roles: { role: { code: string; nameAr: string; nameEn: string } }[] }
interface Role { id: string; code: string; nameAr: string; nameEn: string; isSystem: boolean; userCount: number; permissionCodes: string[] }
interface Perm { id: string; code: string; description: string | null }
interface Setting { key: string; value: unknown }
interface Period { id: string; name: string; startDate: string; endDate: string; status: string; _count?: { entries: number } }
interface Audit { id: string; userId: string | null; action: string; entity: string; entityId: string | null; createdAt: string; user?: { email: string } | null; newData?: unknown; reason?: string | null }

export default function AdminPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'users' | 'roles' | 'settings' | 'periods' | 'audit'>('users');
  return (
    <>
      <PageHeader title={tr('الإدارة والصلاحيات', 'Administration & permissions')} sub={tr('المستخدمون والأدوار والإعدادات والفترات والرقابة', 'Users, roles, settings, fiscal periods and audit')} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'users', label: tr('المستخدمون', 'Users') },
          { id: 'roles', label: tr('الأدوار', 'Roles') },
          { id: 'settings', label: tr('الإعدادات', 'Settings') },
          { id: 'periods', label: tr('الفترات المالية', 'Fiscal periods') },
          { id: 'audit', label: tr('سجل الرقابة', 'Audit log') },
        ]} />
      </div>
      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'roles' ? <RolesTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
      {tab === 'periods' ? <PeriodsTab /> : null}
      {tab === 'audit' ? <AuditTab /> : null}
    </>
  );
}

/* ---------------- users ---------------- */

function UsersTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const roles = useApi<Role[]>('roles');
  const branches = useOptions<{ id: string; code: string; nameAr: string; nameEn: string }>(
    'branches?pageSize=100',
    (b) => ({ value: b.id, label: `${b.code} · ${lang === 'ar' ? b.nameAr : b.nameEn}` }),
  );
  const { data, error, loading, reload } = usePaged<User>(`users?${queryString({ page, pageSize })}`);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey]); // eslint-disable-line
  const [form, setForm] = useState({ email: '', fullName: '', password: '', roleCodes: [] as string[], branchId: '' });
  useEffect(() => { if (creating) setForm({ email: '', fullName: '', password: '', roleCodes: [], branchId: '' }); }, [creating]);
  const [statusForm, setStatusForm] = useState({ isActive: true, reason: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      await post('users', { ...form, ...(form.branchId ? {} : { branchId: undefined }) });
      toast.success(tr('تم إنشاء المستخدم', 'User created'));
      setCreating(false);
      setRefreshKey((n) => n + 1);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function changeStatus() {
    if (!statusTarget) return;
    setBusy(true); setFerr(null);
    try {
      await patch(`users/${statusTarget.id}/status`, statusForm);
      toast.success(tr('تم تحديث الحالة', 'Status updated'));
      setStatusTarget(null);
      setRefreshKey((n) => n + 1);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('مستخدم جديد', 'New user')}</Button>
      </div>
      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
            <DataTable<User>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'email', header: tr('البريد', 'Email'), render: (r) => r.email },
                { key: 'name', header: tr('الاسم', 'Name'), render: (r) => r.fullName },
                { key: 'roles', header: tr('الأدوار', 'Roles'), render: (r) => r.roles.map((x) => x.role.code).join(', ') },
                { key: 'branch', header: tr('الفرع', 'Branch'), render: (r) => (r.branch ? (lang === 'ar' ? r.branch.nameAr : r.branch.nameEn) : tr('كل الفروع', 'All branches')) },
                { key: 'status', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
                {
                  key: 'actions',
                  header: '',
                  align: 'end',
                  width: '1%',
                  render: (r) => <IconButton icon="edit" title={tr('تغيير الحالة', 'Change status')} onClick={() => { setStatusTarget(r); setStatusForm({ isActive: !r.isActive, reason: '' }); }} />,
                },
              ]}
              empty={<EmptyState title={tr('لا توجد مستخدمون', 'No users')} />}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        ) : null}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('مستخدم جديد', 'New user')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="u-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="u-form" onSubmit={createUser}>
          <div className="form-grid">
            <Field label={tr('البريد', 'Email')} required className="col-6"><Input type="email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" /></Field>
            <Field label={tr('الاسم', 'Full name')} required className="col-6"><Input value={form.fullName} required onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label={tr('كلمة المرور', 'Password')} required className="col-6"><Input type="password" value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" /></Field>
            <Field label={tr('الأدوار', 'Roles')} required className="col-6">
              <Select multiple value={form.roleCodes} onChange={(e) => setForm({ ...form, roleCodes: Array.from((e.target as HTMLSelectElement).selectedOptions).map((o) => o.value) })} style={{ height: 120 }}>
                {(roles.data ?? []).map((r) => <option key={r.id} value={r.code}>{r.code} · {lang === 'ar' ? r.nameAr : r.nameEn}</option>)}
              </Select>
            </Field>
            <Field label={tr('الفرع', 'Branch')} className="col-6">
              <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{tr('كل الفروع (مدير نظام)', 'All branches (system admin)')}</option>
                {branches.options.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </Select>
            </Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>

      <Modal open={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} title={tr('تغيير حالة المستخدم', 'Change user status')} footer={
        <>
          <Button variant="ghost" onClick={() => setStatusTarget(null)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button loading={busy} onClick={changeStatus}>{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <div className="form-grid">
          <Field label={tr('نشط', 'Active')} className="col-4">
            <Select value={statusForm.isActive ? 'yes' : 'no'} onChange={(e) => setStatusForm({ ...statusForm, isActive: e.target.value === 'yes' })}>
              <option value="yes">{tr('نعم', 'Yes')}</option>
              <option value="no">{tr('لا', 'No')}</option>
            </Select>
          </Field>
          <Field label={tr('السبب', 'Reason')} required className="col-8"><Textarea value={statusForm.reason} onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })} /></Field>
        </div>
        <ErrorNote error={ferr} />
      </Modal>
    </>
  );
}

/* ---------------- roles ---------------- */

function RolesTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const roles = useApi<Role[]>('roles');
  const perms = useApi<Perm[]>('permissions');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '', permissionCodes: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  useEffect(() => {
    if (creating && !editing) setForm({ code: '', nameAr: '', nameEn: '', permissionCodes: [] });
    if (editing) setForm({ code: editing.code, nameAr: editing.nameAr, nameEn: editing.nameEn, permissionCodes: editing.permissionCodes });
  }, [creating, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      if (editing) {
        await patch(`roles/${editing.id}`, { nameAr: form.nameAr, nameEn: form.nameEn, permissionCodes: form.permissionCodes });
      } else {
        await post('roles', form);
      }
      toast.success(tr('تم حفظ الدور', 'Role saved'));
      setCreating(false); setEditing(null);
      roles.reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => { setEditing(null); setCreating(true); }}>{tr('دور جديد', 'New role')}</Button>
      </div>
      <Card>
        <ErrorNote error={roles.error} />
        {roles.loading && !roles.data ? <Loading /> : null}
        {roles.data ? (
          <DataTable<Role>
            rows={roles.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'code', header: tr('الكود', 'Code'), render: (r) => <span className="tree-code">{r.code}</span> },
              { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
              { key: 'users', header: tr('مستخدمون', 'Users'), align: 'end', render: (r) => r.userCount },
              { key: 'perms', header: tr('صلاحيات', 'Permissions'), align: 'end', render: (r) => r.permissionCodes.length },
              { key: 'system', header: tr('نظام', 'System'), align: 'center', render: (r) => (r.isSystem ? '✓' : '—') },
              {
                key: 'actions',
                header: '',
                align: 'end',
                width: '1%',
                render: (r) => <IconButton icon="edit" title={tr('تعديل', 'Edit')} onClick={() => { setEditing(r); setCreating(true); }} />,
              },
            ]}
            empty={<EmptyState title={tr('لا توجد أدوار', 'No roles')} />}
          />
        ) : null}
      </Card>

      <Modal open={creating} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? tr('تعديل دور', 'Edit role') : tr('دور جديد', 'New role')} size="xl" footer={
        <>
          <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="r-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="r-form" onSubmit={submit}>
          <div className="form-grid">
            {!editing ? (
              <Field label={tr('الكود', 'Code')} required className="col-4"><Input value={form.code} required disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" /></Field>
            ) : null}
            <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-4"><Input value={form.nameAr} required onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
            <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-4"><Input value={form.nameEn} required onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
            <Field label={tr('الصلاحيات', 'Permissions')} className="col-12">
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                {(perms.data ?? []).map((p) => (
                  <label key={p.id} className="check" style={{ display: 'flex', padding: '4px 2px' }}>
                    <input type="checkbox" checked={form.permissionCodes.includes(p.code)} onChange={(e) => {
                      const n = new Set(form.permissionCodes);
                      if (e.target.checked) n.add(p.code); else n.delete(p.code);
                      setForm({ ...form, permissionCodes: [...n] });
                    }} />
                    <span style={{ marginInlineStart: 6 }}>{p.code}</span>
                    <span className="muted" style={{ marginInlineStart: 8, fontSize: 12 }}>{p.description}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}

/* ---------------- settings ---------------- */

function SettingsTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Setting[]>('settings');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  useEffect(() => {
    const m: Record<string, string> = {};
    (data ?? []).forEach((s) => { m[s.key] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value); });
    setEdits(m);
  }, [data]);

  async function save() {
    setBusy(true); setFerr(null);
    try {
      const settings = Object.entries(edits).map(([key, value]) => {
        let v: unknown = value;
        try { v = JSON.parse(value); } catch { v = value; }
        return { key, value: v };
      });
      await put('settings', { settings });
      toast.success(tr('تم حفظ الإعدادات', 'Settings saved'));
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <div className="form-grid" style={{ padding: 16 }}>
            {(data ?? []).map((s) => (
              <Field key={s.key} label={s.key} className="col-6">
                {s.key === 'inventory.valuationMethod' ? (
                  <Select value={edits[s.key] ?? 'WEIGHTED_AVERAGE'} onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}>
                    <option value="WEIGHTED_AVERAGE">{tr('متوسط مرجح', 'Weighted average')}</option>
                    <option value="FIFO">{tr('أول ما يدخل أول ما يخرج (FIFO)', 'First in, first out (FIFO)')}</option>
                  </Select>
                ) : (
                  <Input value={edits[s.key] ?? ''} onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })} dir="ltr" />
                )}
              </Field>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            <ErrorNote error={ferr} />
            <Button loading={busy} onClick={save} icon="save">{tr('حفظ', 'Save')}</Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/* ---------------- periods ---------------- */

function PeriodsTab() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Period[]>('fiscal-periods');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      await post('fiscal-periods', form);
      toast.success(tr('تم إنشاء الفترة', 'Period created'));
      setCreating(false);
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function closePeriod(id: string) {
    setBusy(true); setFerr(null);
    try {
      await patch(`fiscal-periods/${id}`, { status: 'CLOSED' });
      toast.success(tr('تم إغلاق الفترة', 'Period closed'));
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tr('فترة جديدة', 'New period')}</Button>
      </div>
      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <DataTable<Period>
            rows={data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: tr('الاسم', 'Name'), render: (r) => r.name },
              { key: 'start', header: tr('البداية', 'Start'), render: (r) => <DateText value={r.startDate} /> },
              { key: 'end', header: tr('النهاية', 'End'), render: (r) => <DateText value={r.endDate} /> },
              { key: 'status', header: tr('الحالة', 'Status'), render: (r) => (r.status === 'OPEN' ? <Badge tone="ok">{tr('مفتوحة', 'Open')}</Badge> : <Badge tone="muted">{tr('مغلقة', 'Closed')}</Badge>) },
              { key: 'entries', header: tr('قيود', 'Entries'), align: 'end', render: (r) => r._count?.entries ?? 0 },
              {
                key: 'actions',
                header: '',
                align: 'end',
                width: '1%',
                render: (r) => (r.status === 'OPEN' ? <Button size="sm" variant="danger" onClick={() => closePeriod(r.id)}>{tr('إغلاق', 'Close')}</Button> : null),
              },
            ]}
            empty={<EmptyState title={tr('لا توجد فترات', 'No periods')} />}
          />
        ) : null}
      </Card>
      <ErrorNote error={ferr} />

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('فترة مالية جديدة', 'New fiscal period')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreating(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="p-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="p-form" onSubmit={create}>
          <div className="form-grid">
            <Field label={tr('الاسم', 'Name')} required className="col-12"><Input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={tr('البداية', 'Start')} required className="col-6"><Input type="date" dir="ltr" value={form.startDate} required onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label={tr('النهاية', 'End')} required className="col-6"><Input type="date" dir="ltr" value={form.endDate} required onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}

/* ---------------- audit ---------------- */

function AuditTab() {
  const { tr, lang } = useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const path = useMemo(() => `audit-logs?${queryString({ page, pageSize, entity, userId })}`, [page, pageSize, entity, userId]);
  const { data, error, loading } = usePaged<Audit>(path);
  return (
    <Card>
      <div className="toolbar" style={{ padding: '12px 16px 0' }}>
        <Input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder={tr('الكيان (مثال: Invoice)', 'Entity (e.g. Invoice)')} style={{ width: 200 }} />
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={tr('معرّف المستخدم', 'User id')} style={{ width: 260 }} dir="ltr" />
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <DataTable<Audit>
            rows={data.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'date', header: tr('الوقت', 'Time'), render: (r) => <DateText value={r.createdAt} /> },
              { key: 'user', header: tr('المستخدم', 'User'), render: (r) => r.user?.email ?? r.userId ?? '—' },
              { key: 'action', header: tr('العملية', 'Action'), render: (r) => r.action },
              { key: 'entity', header: tr('الكيان', 'Entity'), render: (r) => `${r.entity}${r.entityId ? ' · ' + r.entityId.slice(0, 8) : ''}` },
              { key: 'reason', header: tr('السبب', 'Reason'), render: (r) => r.reason ?? '—' },
            ]}
            empty={<EmptyState title={tr('لا توجد سجلات', 'No logs')} />}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      ) : null}
    </Card>
  );
}
