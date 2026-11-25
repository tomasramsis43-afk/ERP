import { Injectable } from '@nestjs/common';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { Tx } from '../../modules/accounting/journal/journal-posting.service';
import { PrismaService } from '../../database/prisma.service';

export interface VatConfig {
  enabled: boolean;
  rate: Decimal;
}

/** VAT is a company setting (`vat.enabled`, `vat.rate`); disabled by default. */
@Injectable()
export class VatService {
  constructor(private readonly prisma: PrismaService) {}

  async config(tx?: Tx): Promise<VatConfig> {
    const client = tx ?? this.prisma;
    const rows = await client.setting.findMany({ where: { key: { in: ['vat.enabled', 'vat.rate'] } } });
    const enabled = rows.find((r) => r.key === 'vat.enabled')?.value === true;
    const rate = dec(String(rows.find((r) => r.key === 'vat.rate')?.value ?? '0'));
    return { enabled, rate };
  }

  compute(net: Decimal, cfg: VatConfig): Decimal {
    return cfg.enabled ? roundMoney(net.times(cfg.rate)) : new Decimal(0);
  }
}
