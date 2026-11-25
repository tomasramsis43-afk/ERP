import { Injectable } from '@nestjs/common';
import { Decimal } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { ageLines } from '../parties/aging';

type PartyKind = 'CUSTOMER' | 'SUPPLIER';

/** Aging of every customer or supplier with an open balance, one query for all journal lines. */
@Injectable()
export class AgingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(type: PartyKind, asOfStr?: string) {
    const asOf = asOfStr ? toDate(asOfStr) : toDate(new Date().toISOString());
    const lines = await this.prisma.journalLine.findMany({
      where: { partyType: type, entry: { status: 'POSTED', entryDate: { lte: asOf } } },
      select: { partyId: true, debit: true, credit: true, entry: { select: { entryDate: true } } },
      orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
    });
    const byParty = new Map<string, { date: Date; debit: string; credit: string }[]>();
    for (const l of lines) {
      if (!l.partyId) continue;
      const list = byParty.get(l.partyId) ?? [];
      list.push({ date: l.entry.entryDate, debit: l.debit.toString(), credit: l.credit.toString() });
      byParty.set(l.partyId, list);
    }
    const ids = [...byParty.keys()];
    const parties = ids.length
      ? type === 'CUSTOMER'
        ? await this.prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, nameAr: true, nameEn: true } })
        : await this.prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, nameAr: true, nameEn: true } })
      : [];
    const rows = parties
      .map((p) => ({ ...p, ...ageLines(type, byParty.get(p.id)!.map((x) => ({ date: x.date, debit: String(x.debit), credit: String(x.credit) })), asOf) }))
      .filter((r) => Number(r.total) !== 0 || Number(r.unappliedCredit) !== 0)
      .sort((a, b) => Number(b.total) - Number(a.total));
    const sum = (k: 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'over90' | 'total' | 'unappliedCredit') =>
      rows.reduce((a, r) => a.plus(r[k]), new Decimal(0)).toFixed(2);
    return {
      type,
      asOf: asOf.toISOString().slice(0, 10),
      rows,
      totals: {
        current: sum('current'),
        days1to30: sum('days1to30'),
        days31to60: sum('days31to60'),
        days61to90: sum('days61to90'),
        over90: sum('over90'),
        total: sum('total'),
        unappliedCredit: sum('unappliedCredit'),
      },
    };
  }
}
