'use client';

import React, { useMemo, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Modal, Money, PageHeader, Select } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { post, patch } from '@/lib/api';

interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentId: string | null;
  isPostable: boolean;
  isActive: boolean;
  openingDebit?: string;
  openingCredit?: string;
}

const TYPE_LABEL: Record<string, [string, string]> = {
  ASSET: ['أصل', 'Asset'],
  LIABILITY: ['التزام', 'Liability'],
  EQUITY: ['حقوق ملكية', 'Equity'],
  REVENUE: ['إيراد', 'Revenue'],
  EXPENSE: ['مصروف', 'Expense'],
};

export default function AccountsPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Account[]>('accounting/accounts');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '', type: 'ASSET', parentId: '', isPostable: true, openingDebit: '', openingCredit: '' });
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data ?? [];
    const byId = new Map(list.map((a) => [a.id, a]));
    const children = new Map<string | null, Account[]>();
    for (const a of list) {
      const k = a.parentId ?? null;
      if (!children.has(k)) children.set(k, []);
      children.get(k)!.push(a);
    }
    const out: { acc: Account; depth: number }[] = [];
    function walk(parentId: string | null, depth: number) {
      const kids = (children.get(parentId) ?? []).sort((a, b) => a.code.localeCompare(b.code));
      for (const k of kids) {
        out.push({ acc: k, depth });
        walk(k.id, depth + 1);
      }
    }
    walk(null, 0);
    // fallback: include any orphaned at top
    return out;
  }, [data]);

  function openCreate() {
    setEditing(null);
    setForm({ code: '', nameAr: '', nameEn: '', type: 'ASSET', parentId: '', isPostable: true, openingDebit: '', openingCredit: '' });
    setCreating(true);
  }
  function openEdit(a: Account) {
    setCreating(false);
    setEditing(a);
    setForm({
      code: a.code,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      type: a.type,
      parentId: a.parentId ?? '',
      isPostable: a.isPostable,
      openingDebit: a.openingDebit ?? '',
      openingCredit: a.openingCredit ?? '',
    });
    setCreating(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { nameAr: form.nameAr, nameEn: form.nameEn, isActive: true };
        if (form.openingDebit) payload.openingDebit = form.openingDebit;
        if (form.openingCredit) payload.openingCredit = form.openingCredit;
        await patch(`accounting/accounts/${editing.id}`, payload);
      } else {
        const payload: Record<string, unknown> = { code: form.code, nameAr: form.nameAr, nameEn: form.nameEn, type: form.type, isPostable: form.isPostable };
        if (form.parentId) payload.parentId = form.parentId;
        await post('accounting/accounts', payload);
      }
      toast.success(tr('تم حفظ الحساب', 'Account saved'));
      setCreating(false); setEditing(null);
      reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={tr('شجرة الحسابات', 'Chart of accounts')} sub={tr('الحسابات والحسابات التجميعية والأرصدة الافتتاحية', 'Accounts, groups and opening balances')}>
        <Button icon="plus" onClick={openCreate}>{tr('حساب جديد', 'New account')}</Button>
      </PageHeader>
      <Card>
        <ErrorNote error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <DataTable<{ acc: Account; depth: number }>
            rows={rows}
            rowKey={(r) => r.acc.id}
            columns={[
              { key: 'code', header: tr('الكود', 'Code'), width: '120px', render: (r) => <span className="tree-code">{r.acc.code}</span> },
              {
                key: 'name',
                header: tr('الاسم', 'Name'),
                render: (r) => (
                  <span style={{ paddingInlineStart: r.depth * 18 }}>
                    {r.depth > 0 ? <span className="muted" style={{ marginInlineEnd: 6 }}>└</span> : null}
                    {lang === 'ar' ? r.acc.nameAr : r.acc.nameEn}
                    {!r.acc.isPostable ? <span className="muted" style={{ marginInlineStart: 8, fontSize: 11 }}>({tr('تجميعي', 'group')})</span> : null}
                  </span>
                ),
              },
              { key: 'type', header: tr('النوع', 'Type'), render: (r) => { const l = TYPE_LABEL[r.acc.type]; return <Badge tone="muted">{tr(l[0], l[1])}</Badge>; } },
              { key: 'postable', header: tr('قابل للترحيل', 'Postable'), align: 'center', render: (r) => (r.acc.isPostable ? <Badge tone="ok">{tr('نعم', 'Yes')}</Badge> : <Badge>{tr('لا', 'No')}</Badge>) },
              { key: 'active', header: tr('الحالة', 'Status'), align: 'center', render: (r) => (r.acc.isActive ? <Badge tone="ok">{tr('نشط', 'Active')}</Badge> : <Badge tone="danger">{tr('موقوف', 'Inactive')}</Badge>) },
              { key: 'actions', header: '', align: 'end', width: '1%', render: (r) => <IconButton icon="edit" title={tr('تعديل', 'Edit')} onClick={() => openEdit(r.acc)} /> },
            ]}
            empty={<EmptyState title={tr('لا توجد حسابات', 'No accounts')} />}
          />
        ) : null}
      </Card>

      <Modal open={creating} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? tr('تعديل حساب', 'Edit account') : tr('حساب جديد', 'New account')} size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>{tr('إلغاء', 'Cancel')}</Button>
            <Button type="submit" form="acc-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
          </>
        }
      >
        <form id="acc-form" onSubmit={submit}>
          <div className="form-grid">
            {!editing ? (
              <>
                <Field label={tr('الكود', 'Code')} required className="col-4"><Input value={form.code} required disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" /></Field>
                <Field label={tr('النوع', 'Type')} required className="col-4">
                  <Select value={form.type} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{tr(v[0], v[1])}</option>)}
                  </Select>
                </Field>
                <Field label={tr('الحساب الأب', 'Parent account')} className="col-4">
                  <Select value={form.parentId} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                    <option value="">—</option>
                    {(data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {lang === 'ar' ? a.nameAr : a.nameEn}</option>)}
                  </Select>
                </Field>
                <Field label={tr('قابل للترحيل', 'Postable')} className="col-4">
                  <Select value={form.isPostable ? 'yes' : 'no'} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, isPostable: e.target.value === 'yes' })}>
                    <option value="yes">{tr('نعم', 'Yes')}</option>
                    <option value="no">{tr('لا', 'No')}</option>
                  </Select>
                </Field>
              </>
            ) : null}
            <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-6"><Input value={form.nameAr} required onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
            <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-6"><Input value={form.nameEn} required onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
            {editing ? (
              <>
                <Field label={tr('رصيد افتتاحي مدين', 'Opening debit')} className="col-6"><Input type="number" min="0" step="0.01" dir="ltr" value={form.openingDebit} onChange={(e) => setForm({ ...form, openingDebit: e.target.value })} /></Field>
                <Field label={tr('رصيد افتتاحي دائن', 'Opening credit')} className="col-6"><Input type="number" min="0" step="0.01" dir="ltr" value={form.openingCredit} onChange={(e) => setForm({ ...form, openingCredit: e.target.value })} /></Field>
              </>
            ) : null}
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>
    </>
  );
}
