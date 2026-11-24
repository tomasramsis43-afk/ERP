import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/** Logical roles of accounts used by automatic postings, mapped to default chart codes. */
export const SYSTEM_ACCOUNT_DEFAULTS = {
  CASH: '1101',
  BANK: '1102',
  CHEQUES_UNDER_COLLECTION: '1103',
  RECEIVABLES: '12',
  INVENTORY: '13',
  REP_CASH_CUSTODY: '1401',
  VEHICLE_STOCK: '1402',
  PAYABLES: '21',
  VAT_PAYABLE: '24',
  OPENING_EQUITY: '34',
  SALES: '41',
  SALES_RETURNS: '42',
  COGS: '51',
  COMMISSION_EXPENSE: '53',
  CUSTODY_DIFFERENCE: '59',
  INVENTORY_ADJUSTMENT: '60',
} as const;

export type SystemAccountKey = keyof typeof SYSTEM_ACCOUNT_DEFAULTS;

/**
 * Resolves system roles to account ids. A deployment can remap a role by setting
 * `accounts.<KEY>` (e.g. "accounts.SALES") to another account code.
 */
@Injectable()
export class SystemAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(keys: SystemAccountKey[], tx?: Prisma.TransactionClient): Promise<Record<SystemAccountKey, string>> {
    const client = tx ?? this.prisma;
    const overrides = await client.setting.findMany({ where: { key: { in: keys.map((k) => `accounts.${k}`) } } });
    const codeFor = (k: SystemAccountKey): string => {
      const o = overrides.find((s) => s.key === `accounts.${k}`);
      return typeof o?.value === 'string' ? o.value : SYSTEM_ACCOUNT_DEFAULTS[k];
    };
    const codes = keys.map(codeFor);
    const accounts = await client.account.findMany({ where: { code: { in: codes } } });
    const result = {} as Record<SystemAccountKey, string>;
    for (const k of keys) {
      const acc = accounts.find((a) => a.code === codeFor(k));
      if (!acc) throw new InternalServerErrorException(`System account ${k} (code ${codeFor(k)}) is not configured`);
      result[k] = acc.id;
    }
    return result;
  }
}
