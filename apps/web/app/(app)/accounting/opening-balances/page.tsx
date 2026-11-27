'use client';

import React, { useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Button, Card, ErrorNote, Field, Input, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { post, uuid } from '@/lib/api';
import { today } from '@/lib/format';

interface Party { id: string; code: string; nameAr: string; nameEn?: string }
interface PartyList { items: Party[] }

export default function OpeningBalancesPage() {
  const { tr, lang } = useApp();
  const toast = useToast();
  const customers = useApi<PartyList>('customers?pageSize=100');
  const suppliers = useApi<PartyList>('suppliers?pageSize=100');
  const [date, setDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [customerAmount, setCustomerAmount] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierAmount, setSupplierAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (p: Party) => `${p.code} · ${lang === 'ar' ? p.nameAr : p.nameEn ?? p.nameAr}`;

  async function submit() {
    const lines = [
      ...(customerId && Number(customerAmount) > 0 ? [{ partyType: 'CUSTOMER', partyId: customerId, amount: customerAmount }] : []),
      ...(supplierId && Number(supplierAmount) > 0 ? [{ partyType: 'SUPPLIER', partyId: supplierId, amount: supplierAmount }] : []),
    ];
    if (!lines.length) {
      setError(tr('أدخل رصيدًا واحدًا على الأقل', 'Enter at least one balance'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('accounting/opening-balances', { date, note: note || undefined, idempotencyKey: uuid(), lines });
      toast.success(tr('تم ترحيل الأرصدة الافتتاحية', 'Opening balances posted'));
      setCustomerAmount('');
      setSupplierAmount('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={tr('الأرصدة الافتتاحية', 'Opening balances')}
        sub={tr('ترحيل أرصدة العملاء والموردين كقيد متوازن يظهر في كشوفات الأطراف', 'Post customer and supplier balances as a balanced entry visible in party statements')}
      />
      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 16 }}>
          <div className="toolbar">
            <Field label={tr('التاريخ', 'Date')} className="col-3">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={tr('ملاحظة', 'Note')} className="col-6">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="toolbar">
            <Field label={tr('العميل', 'Customer')} className="col-4">
              <SelectParty parties={customers.data?.items ?? []} value={customerId} onChange={setCustomerId} label={label} all={tr('بدون', 'None')} />
            </Field>
            <Field label={tr('رصيد العميل (مدين)', 'Customer balance (debit)')} className="col-3">
              <Input inputMode="decimal" value={customerAmount} onChange={(e) => setCustomerAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div className="toolbar">
            <Field label={tr('المورد', 'Supplier')} className="col-4">
              <SelectParty parties={suppliers.data?.items ?? []} value={supplierId} onChange={setSupplierId} label={label} all={tr('بدون', 'None')} />
            </Field>
            <Field label={tr('رصيد المورد (دائن)', 'Supplier balance (credit)')} className="col-3">
              <Input inputMode="decimal" value={supplierAmount} onChange={(e) => setSupplierAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <ErrorNote error={error || customers.error || suppliers.error} />
          <div><Button loading={busy} onClick={submit} icon="check">{tr('ترحيل الأرصدة', 'Post balances')}</Button></div>
        </div>
      </Card>
    </>
  );
}

function SelectParty({ parties, value, onChange, label, all }: { parties: Party[]; value: string; onChange: (v: string) => void; label: (p: Party) => string; all: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {parties.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
    </select>
  );
}
