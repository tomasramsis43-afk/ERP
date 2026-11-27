'use client';

import React, { useState } from 'react';
import { useApp, useConfirm, useToast } from '@/components/Providers';
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { post } from '@/lib/api';

interface Rule {
  id: string;
  representativeId: string | null;
  basis: 'SALES' | 'COLLECTIONS' | 'MARGIN';
  ratePercent: string;
  productId: string | null;
  customerId: string | null;
  geoAreaId: string | null;
}
interface Named { id: string; nameAr: string; nameEn: string | null; code?: string }

const EMPTY = { basis: 'SALES', ratePercent: '', representativeId: '', productId: '', customerId: '', geoAreaId: '' };

/** Commission policies: percentage of sales, collections or margin, optionally scoped. */
export default function CommissionRulesPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const rules = useApi<Rule[]>('representatives/commission-rules');
  const reps = useApi<{ items: Named[] }>('representatives?pageSize=200');
  const products = useApi<{ items: Named[] }>('products?pageSize=200');
  const customers = useApi<{ items: Named[] }>('customers?pageSize=200');
  const areas = useApi<Named[]>('geo-areas');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const name = (list: Named[] | null | undefined, id: string | null) => {
    if (!id) return null;
    const n = list?.find((x) => x.id === id);
    return n ? (lang === 'ar' ? n.nameAr : n.nameEn || n.nameAr) : id.slice(0, 8);
  };
  const basisLabel = (b: Rule['basis']) =>
    b === 'SALES' ? tr('نسبة من المبيعات', '% of sales') : b === 'COLLECTIONS' ? tr('نسبة من التحصيلات', '% of collections') : tr('نسبة من هامش الربح', '% of margin');

  function openForm() {
    setForm(EMPTY);
    setErr(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, string> = { basis: form.basis, ratePercent: form.ratePercent };
      if (form.representativeId) payload.representativeId = form.representativeId;
      if (form.productId && form.basis !== 'COLLECTIONS') payload.productId = form.productId;
      if (form.customerId) payload.customerId = form.customerId;
      if (form.geoAreaId) payload.geoAreaId = form.geoAreaId;
      await post('representatives/commission-rules', payload);
      toast.success(tr('تم حفظ القاعدة', 'Rule saved'));
      setOpen(false);
      rules.reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(r: Rule) {
    const ok = await confirm({
      title: tr('إيقاف القاعدة', 'Deactivate rule'),
      message: tr('لن تُحتسب هذه القاعدة على العمليات الجديدة. العمولات المحتسبة سابقًا لا تتغير.', 'New transactions will no longer use this rule. Commissions already calculated are unchanged.'),
      confirmLabel: tr('إيقاف', 'Deactivate'),
      danger: true,
    });
    if (!ok) return;
    try {
      await post(`representatives/commission-rules/${r.id}/deactivate`);
      toast.success(tr('تم إيقاف القاعدة', 'Rule deactivated'));
      rules.reload();
    } catch (e2) {
      toast.failure((e2 as Error).message);
    }
  }

  return (
    <>
      <PageHeader title={tr('قواعد العمولات', 'Commission rules')} sub={tr('سياسات احتساب عمولة المناديب', 'How representative commissions are calculated')}>
        <Button icon="plus" onClick={openForm}>{tr('قاعدة جديدة', 'New rule')}</Button>
      </PageHeader>
      <Card>
        <ErrorNote error={rules.error} />
        {rules.loading && !rules.data ? <Loading /> : null}
        {rules.data ? (
          <DataTable<Rule>
            rows={rules.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'basis', header: tr('الأساس', 'Basis'), render: (r) => basisLabel(r.basis) },
              { key: 'rate', header: tr('النسبة', 'Rate'), align: 'end', render: (r) => <span className="mono" dir="ltr">{Number(r.ratePercent)}%</span> },
              { key: 'rep', header: tr('المندوب', 'Representative'), render: (r) => name(reps.data?.items, r.representativeId) ?? <Badge>{tr('كل المناديب', 'All')}</Badge> },
              { key: 'product', header: tr('الصنف', 'Product'), render: (r) => name(products.data?.items, r.productId) ?? '—' },
              { key: 'customer', header: tr('العميل', 'Customer'), render: (r) => name(customers.data?.items, r.customerId) ?? '—' },
              { key: 'area', header: tr('المنطقة', 'Area'), render: (r) => name(areas.data, r.geoAreaId) ?? '—' },
              { key: 'act', header: '', align: 'end', render: (r) => <Button variant="ghost" size="sm" onClick={() => deactivate(r)}>{tr('إيقاف', 'Deactivate')}</Button> },
            ]}
            empty={<EmptyState title={tr('لا توجد قواعد عمولات', 'No commission rules yet')} />}
          />
        ) : null}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={tr('قاعدة عمولة جديدة', 'New commission rule')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tr('إلغاء', 'Cancel')}</Button>
            <Button type="submit" form="rule-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
          </>
        }
      >
        <form id="rule-form" onSubmit={save}>
          <ErrorNote error={err} />
          <div className="form-grid">
            <Field label={tr('أساس الاحتساب', 'Basis')} required className="col-6">
              <Select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value, productId: e.target.value === 'COLLECTIONS' ? '' : form.productId })}>
                <option value="SALES">{tr('نسبة من المبيعات', '% of sales')}</option>
                <option value="COLLECTIONS">{tr('نسبة من التحصيلات', '% of collections')}</option>
                <option value="MARGIN">{tr('نسبة من هامش الربح', '% of margin')}</option>
              </Select>
            </Field>
            <Field label={tr('النسبة %', 'Rate %')} required hint={tr('من 0 إلى 100', '0 to 100')} className="col-6">
              <Input value={form.ratePercent} required inputMode="decimal" pattern="\d{1,3}(\.\d{1,4})?" dir="ltr" onChange={(e) => setForm({ ...form, ratePercent: e.target.value })} />
            </Field>
            <Field label={tr('المندوب', 'Representative')} hint={tr('اتركه فارغًا لتطبيقها على الجميع', 'Leave empty to apply to everyone')} className="col-6">
              <Select value={form.representativeId} onChange={(e) => setForm({ ...form, representativeId: e.target.value })}>
                <option value="">{tr('كل المناديب', 'All representatives')}</option>
                {(reps.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{lang === 'ar' ? r.nameAr : r.nameEn || r.nameAr}</option>)}
              </Select>
            </Field>
            {form.basis !== 'COLLECTIONS' ? (
              <Field label={tr('الصنف', 'Product')} className="col-6">
                <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">—</option>
                  {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.nameAr : p.nameEn || p.nameAr}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field label={tr('العميل', 'Customer')} className="col-6">
              <Select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="">—</option>
                {(customers.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.nameAr : c.nameEn || c.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('المنطقة', 'Area')} className="col-6">
              <Select value={form.geoAreaId} onChange={(e) => setForm({ ...form, geoAreaId: e.target.value })}>
                <option value="">—</option>
                {(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{lang === 'ar' ? a.nameAr : a.nameEn || a.nameAr}</option>)}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
