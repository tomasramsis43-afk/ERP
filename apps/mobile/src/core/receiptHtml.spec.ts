import { daySummaryHtml, esc, receiptHtml } from './receiptHtml';
import { Receipt, ReceiptLabels, summarizeDay } from './receipts';

const L: ReceiptLabels = {
  title: { CASH_SALE: 'إيصال بيع نقدي', CREDIT_SALE: 'c', RETURN_GOOD: 'g', RETURN_DAMAGED: 'd', COLLECTION: 'تحصيل' },
  customer: 'العميل', date: 'التاريخ', total: 'الإجمالي', estimate: 'تقدير', ref: 'مرجع',
};
const r: Receipt = {
  opId: 'abcdef12-0000-4000-8000-000000000000', kind: 'CASH_SALE', date: '2026-11-28', createdAt: '2026-11-28T10:00:00Z',
  customerId: 'c1', customerName: 'شركة <b>الأمل</b> & أولاده', lines: [{ name: 'حليب "كامل"', quantity: '2', amount: '30.00' }], total: '30.00',
};

describe('receipt html', () => {
  it('escapes every user-controlled value', () => {
    expect(esc(`<script>alert('x')</script>&"`)).toBe('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;');
    const html = receiptHtml(r, L, 'rtl');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;الأمل&lt;/b&gt; &amp; أولاده');
    expect(html).toContain('حليب &quot;كامل&quot;');
  });
  it('sets direction and language for Arabic and English', () => {
    expect(receiptHtml(r, L, 'rtl')).toContain('dir="rtl" lang="ar"');
    expect(receiptHtml(r, L, 'ltr')).toContain('dir="ltr" lang="en"');
  });
  it('contains the total and a short reference', () => {
    const html = receiptHtml(r, L, 'rtl');
    expect(html).toContain('30.00');
    expect(html).toContain('abcdef12');
  });
  it('renders the day summary with the expected cash', () => {
    const sum = summarizeDay([r], '2026-11-28');
    const html = daySummaryHtml(sum, { title: 'ملخص', date: 'التاريخ', operations: 'o', cashSales: 'cs', creditSales: 'cr', collections: 'co', returnsGood: 'g', returnsDamaged: 'd', cashRefunds: 'cf', expenses: 'ex', expectedCash: 'المتوقع', estimate: 'e' }, 'rtl');
    expect(html).toContain('30.00');
    expect(html).toContain('المتوقع');
  });
});
