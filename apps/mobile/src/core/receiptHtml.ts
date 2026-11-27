import { DaySummary, Receipt, ReceiptLabels } from './receipts';

export type Direction = 'rtl' | 'ltr';

export interface SummaryLabels {
  title: string;
  date: string;
  operations: string;
  cashSales: string;
  creditSales: string;
  collections: string;
  returnsGood: string;
  returnsDamaged: string;
  cashRefunds: string;
  expectedCash: string;
  estimate: string;
}

/** Escapes text for HTML so a customer or product name can never inject markup into the printed document. */
export function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const page = (dir: Direction, body: string) => `<!DOCTYPE html>
<html dir="${dir}" lang="${dir === 'rtl' ? 'ar' : 'en'}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 6px 4px; border-bottom: 1px solid #ddd; text-align: start; font-size: 14px; }
  td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: plaintext; }
  .total { font-weight: 700; font-size: 16px; }
  .note { color: #777; font-size: 12px; margin-top: 12px; }
</style></head><body>${body}</body></html>`;

/** Printable receipt (rendered to PDF by the platform web renderer, which shapes Arabic natively). */
export function receiptHtml(r: Receipt, L: ReceiptLabels, dir: Direction): string {
  const rows = r.lines
    .map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${esc(l.quantity)}</td><td class="num">${esc(l.amount ?? '')}</td></tr>`)
    .join('');
  return page(
    dir,
    `<h1>${esc(L.title[r.kind])}</h1>
<div class="meta">${esc(L.date)}: ${esc(r.date)}${r.customerName ? ` · ${esc(L.customer)}: ${esc(r.customerName)}` : ''}</div>
${rows ? `<table><tbody>${rows}</tbody></table>` : ''}
<div class="total">${esc(L.total)}: <span dir="ltr">${esc(r.total)}</span></div>
<div class="note">${esc(L.estimate)} · ${esc(L.ref)}: ${esc(r.opId.slice(0, 8))}</div>`,
  );
}

/** Printable end-of-day summary. */
export function daySummaryHtml(sum: DaySummary, L: SummaryLabels, dir: Direction): string {
  const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
  return page(
    dir,
    `<h1>${esc(L.title)}</h1>
<div class="meta">${esc(L.date)}: ${esc(sum.date)}</div>
<table><tbody>
${row(L.operations, String(sum.count))}
${row(L.cashSales, sum.cashSales)}
${row(L.creditSales, sum.creditSales)}
${row(L.collections, sum.collections)}
${row(L.returnsGood, sum.returnsGood)}
${row(L.returnsDamaged, sum.returnsDamaged)}
${row(L.cashRefunds, sum.cashRefunds)}
${row(L.expectedCash, sum.expectedCash, 'total')}
</tbody></table>
<div class="note">${esc(L.estimate)}</div>`,
  );
}
