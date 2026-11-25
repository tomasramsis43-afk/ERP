import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { ageLines } from './aging';

export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export interface StatementRow {
  entryId: string;
  entryNumber: number;
  entryDate: Date;
  description: string;
  debit: string;
  credit: string;
  balance: string;
}

/**
 * Party balances and statements come from POSTED journal lines tagged with the party,
 * never from summing invoices. Customers: debit-positive. Suppliers: credit-positive.
 */
@Injectable()
export class PartyLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(type: PartyType, partyId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<Decimal> {
    const s = await client.journalLine.aggregate({
      where: { partyType: type, partyId, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const net = dec(s._sum.debit?.toString() ?? '0').minus(dec(s._sum.credit?.toString() ?? '0'));
    return type === 'CUSTOMER' ? net : net.negated();
  }

  async balances(type: PartyType, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.journalLine.groupBy({
      by: ['partyId'],
      where: { partyType: type, partyId: { in: ids }, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const out = new Map<string, string>(ids.map((id) => [id, '0.00']));
    for (const r of rows) {
      const net = dec(r._sum.debit?.toString() ?? '0').minus(dec(r._sum.credit?.toString() ?? '0'));
      out.set(r.partyId!, (type === 'CUSTOMER' ? net : net.negated()).toFixed(2));
    }
    return out;
  }

  async statement(type: PartyType, partyId: string, p: { from?: string; to?: string }) {
    const lines = await this.prisma.journalLine.findMany({
      where: { partyType: type, partyId, entry: { status: 'POSTED' } },
      include: { entry: { select: { id: true, number: true, entryDate: true, description: true } } },
      orderBy: [{ entry: { entryDate: 'asc' } }, { entry: { number: 'asc' } }, { id: 'asc' }],
    });
    const sign = type === 'CUSTOMER' ? 1 : -1;
    const from = p.from ? new Date(`${p.from}T00:00:00.000Z`) : undefined;
    const to = p.to ? new Date(`${p.to}T00:00:00.000Z`) : undefined;

    let running = new Decimal(0);
    let opening = new Decimal(0);
    const rows: StatementRow[] = [];
    for (const l of lines) {
      const delta = dec(l.debit.toString()).minus(dec(l.credit.toString())).times(sign);
      if (to && l.entry.entryDate > to) continue;
      running = running.plus(delta);
      if (from && l.entry.entryDate < from) {
        opening = running;
        continue;
      }
      rows.push({
        entryId: l.entry.id,
        entryNumber: l.entry.number,
        entryDate: l.entry.entryDate,
        description: l.description ?? l.entry.description,
        debit: l.debit.toString(),
        credit: l.credit.toString(),
        balance: running.toFixed(2),
      });
    }
    return { openingBalance: opening.toFixed(2), rows, closingBalance: running.toFixed(2) };
  }

  /** Aging of open balance in buckets, FIFO-settled: payments consume the oldest charges first. */
  async aging(type: PartyType, partyId: string, asOf = new Date()) {
    const lines = await this.prisma.journalLine.findMany({
      where: { partyType: type, partyId, entry: { status: 'POSTED', entryDate: { lte: asOf } } },
      include: { entry: { select: { entryDate: true } } },
      orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
    });
    return ageLines(type, lines.map((l) => ({ date: l.entry.entryDate, debit: l.debit, credit: l.credit })), asOf);
  }
}
