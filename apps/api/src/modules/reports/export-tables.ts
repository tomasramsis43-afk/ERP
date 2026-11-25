import { StatementRow } from './statements.service';

export interface Column {
  header: string;
  key: string;
  width: number;
  numeric?: boolean;
}

export interface Table {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Record<string, string>[];
  /** Rows rendered in bold (section headers and totals). */
  boldRows?: number[];
}

export type Lang = 'ar' | 'en';

export const L = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const name = (lang: Lang, r: { nameAr: string; nameEn: string }) => (lang === 'ar' ? r.nameAr : r.nameEn);

/** Builds a flat two-column statement table from titled sections plus totals. */
export class StatementTable {
  readonly rows: Record<string, string>[] = [];
  readonly bold: number[] = [];
  constructor(private readonly lang: Lang) {}

  section(ar: string, en: string): this {
    this.bold.push(this.rows.length);
    this.rows.push({ code: '', name: L(this.lang, ar, en), amount: '' });
    return this;
  }

  items(items: StatementRow[]): this {
    for (const r of items) this.rows.push({ code: r.code, name: name(this.lang, r), amount: r.amount });
    return this;
  }

  total(ar: string, en: string, amount: string): this {
    this.bold.push(this.rows.length);
    this.rows.push({ code: '', name: L(this.lang, ar, en), amount });
    return this;
  }

  table(title: string, subtitle: string): Table {
    return {
      title,
      subtitle,
      columns: [
        { header: L(this.lang, 'الكود', 'Code'), key: 'code', width: 12 },
        { header: L(this.lang, 'البيان', 'Description'), key: 'name', width: 44 },
        { header: L(this.lang, 'المبلغ', 'Amount'), key: 'amount', width: 18, numeric: true },
      ],
      rows: this.rows,
      boldRows: this.bold,
    };
  }
}
