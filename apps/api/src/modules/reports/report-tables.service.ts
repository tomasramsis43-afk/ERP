import { BadRequestException, Injectable } from '@nestjs/common';
import { toDate } from '../accounting/dto/journal.dto';
import { LedgerReportsService } from '../accounting/reports/ledger-reports.service';
import { AgingReportService } from './aging-report.service';
import { L, Lang, StatementTable, Table } from './export-tables';
import { StatementsService } from './statements.service';

export const REPORT_NAMES = ['trial-balance', 'income-statement', 'balance-sheet', 'cash-flow', 'aging-customers', 'aging-suppliers'] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export interface ReportParams {
  from?: string;
  to?: string;
  asOf?: string;
  lang: Lang;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Turns each report into a printable table (used by the Excel and PDF exporters). */
@Injectable()
export class ReportTablesService {
  constructor(
    private readonly ledger: LedgerReportsService,
    private readonly statements: StatementsService,
    private readonly aging: AgingReportService,
  ) {}

  async build(report: ReportName, p: ReportParams): Promise<Table> {
    const lang = p.lang;
    switch (report) {
      case 'trial-balance': {
        const tb = await this.ledger.trialBalance(p.asOf);
        const num = (h: string, k: string, w = 16) => ({ header: h, key: k, width: w, numeric: true });
        return {
          title: L(lang, 'ميزان المراجعة', 'Trial balance'),
          subtitle: `${L(lang, 'حتى', 'As of')} ${tb.asOf}`,
          columns: [
            { header: L(lang, 'الكود', 'Code'), key: 'code', width: 12 },
            { header: L(lang, 'الحساب', 'Account'), key: 'name', width: 36 },
            num(L(lang, 'رصيد افتتاحي', 'Opening'), 'openingBalance'),
            num(L(lang, 'حركة مدين', 'Debit'), 'movementDebit'),
            num(L(lang, 'حركة دائن', 'Credit'), 'movementCredit'),
            num(L(lang, 'رصيد مدين', 'Closing Dr'), 'closingDebit'),
            num(L(lang, 'رصيد دائن', 'Closing Cr'), 'closingCredit'),
          ],
          rows: [
            ...tb.rows.map((r) => ({ code: r.code, name: lang === 'ar' ? r.nameAr : r.nameEn, openingBalance: r.openingBalance, movementDebit: r.movementDebit, movementCredit: r.movementCredit, closingDebit: r.closingDebit, closingCredit: r.closingCredit })),
            { code: '', name: L(lang, 'الإجمالي', 'Total'), openingBalance: '', movementDebit: '', movementCredit: '', closingDebit: tb.totalDebit, closingCredit: tb.totalCredit },
          ],
          boldRows: [tb.rows.length],
        };
      }
      case 'income-statement': {
        const { from, to } = this.range(p);
        const s = await this.statements.incomeStatement(from, to);
        return new StatementTable(lang)
          .section('الإيرادات', 'Revenue').items(s.revenue).total('إجمالي الإيرادات', 'Total revenue', s.totalRevenue)
          .section('تكلفة البضاعة المباعة', 'Cost of goods sold').items(s.costOfGoodsSold).total('إجمالي التكلفة', 'Total cost of goods sold', s.totalCostOfGoodsSold)
          .total('مجمل الربح', 'Gross profit', s.grossProfit)
          .section('المصروفات التشغيلية', 'Operating expenses').items(s.operatingExpenses).total('إجمالي المصروفات', 'Total operating expenses', s.totalOperatingExpenses)
          .total('صافي الربح', 'Net profit', s.netProfit)
          .table(L(lang, 'قائمة الدخل', 'Income statement'), `${s.from} → ${s.to}`);
      }
      case 'balance-sheet': {
        const s = await this.statements.balanceSheet(p.asOf ?? todayStr());
        return new StatementTable(lang)
          .section('الأصول', 'Assets').items(s.assets).total('إجمالي الأصول', 'Total assets', s.totalAssets)
          .section('الالتزامات', 'Liabilities').items(s.liabilities).total('إجمالي الالتزامات', 'Total liabilities', s.totalLiabilities)
          .section('حقوق الملكية', 'Equity').items(s.equity).total('أرباح الفترة الحالية', 'Current earnings', s.currentEarnings)
          .total('إجمالي حقوق الملكية', 'Total equity', s.totalEquity)
          .total('إجمالي الالتزامات وحقوق الملكية', 'Total liabilities and equity', s.totalLiabilitiesAndEquity)
          .table(L(lang, 'الميزانية العمومية', 'Balance sheet'), `${L(lang, 'حتى', 'As of')} ${s.asOf}`);
      }
      case 'cash-flow': {
        const { from, to } = this.range(p);
        const s = await this.statements.cashFlow(from, to);
        return {
          title: L(lang, 'قائمة التدفقات النقدية', 'Cash flow statement'),
          subtitle: `${s.from} → ${s.to}`,
          columns: [
            { header: L(lang, 'مصدر الحركة', 'Source'), key: 'source', width: 30 },
            { header: L(lang, 'داخل', 'Inflow'), key: 'inflow', width: 16, numeric: true },
            { header: L(lang, 'خارج', 'Outflow'), key: 'outflow', width: 16, numeric: true },
            { header: L(lang, 'الصافي', 'Net'), key: 'net', width: 16, numeric: true },
          ],
          rows: [
            { source: L(lang, 'الرصيد النقدي أول الفترة', 'Opening cash'), inflow: '', outflow: '', net: s.openingCash },
            ...s.lines,
            { source: L(lang, 'صافي التغير', 'Net change'), inflow: s.totalInflow, outflow: s.totalOutflow, net: s.netChange },
            { source: L(lang, 'الرصيد النقدي آخر الفترة', 'Closing cash'), inflow: '', outflow: '', net: s.closingCash },
          ],
          boldRows: [0, s.lines.length + 1, s.lines.length + 2],
        };
      }
      case 'aging-customers':
      case 'aging-suppliers': {
        const type = report === 'aging-customers' ? 'CUSTOMER' : 'SUPPLIER';
        const a = await this.aging.report(type, p.asOf);
        const n = (h: string, k: string) => ({ header: h, key: k, width: 14, numeric: true });
        return {
          title: type === 'CUSTOMER' ? L(lang, 'أعمار ديون العملاء', 'Customer aging') : L(lang, 'أعمار ديون الموردين', 'Supplier aging'),
          subtitle: `${L(lang, 'حتى', 'As of')} ${a.asOf}`,
          columns: [
            { header: L(lang, 'الكود', 'Code'), key: 'code', width: 12 },
            { header: L(lang, 'الاسم', 'Name'), key: 'name', width: 30 },
            n(L(lang, 'جاري', 'Current'), 'current'),
            n('1-30', 'days1to30'),
            n('31-60', 'days31to60'),
            n('61-90', 'days61to90'),
            n('90+', 'over90'),
            n(L(lang, 'الإجمالي', 'Total'), 'total'),
          ],
          rows: [
            ...a.rows.map((r) => ({
              code: r.code,
              name: (lang === 'ar' ? r.nameAr : r.nameEn) || r.nameAr,
              current: r.current,
              days1to30: r.days1to30,
              days31to60: r.days31to60,
              days61to90: r.days61to90,
              over90: r.over90,
              total: r.total,
            })),
            { code: '', name: L(lang, 'الإجمالي', 'Total'), ...a.totals },
          ],
          boldRows: [a.rows.length],
        };
      }
    }
  }

  private range(p: ReportParams): { from: string; to: string } {
    if (!p.from || !p.to) throw new BadRequestException('from and to dates are required');
    if (toDate(p.from) > toDate(p.to)) throw new BadRequestException('from must not be after to');
    return { from: p.from, to: p.to };
  }
}
