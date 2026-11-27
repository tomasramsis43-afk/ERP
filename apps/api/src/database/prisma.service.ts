import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // The deployed database (Neon) has high per-query latency, so the default 5s
      // interactive-transaction timeout is too short for multi-step business writes
      // (sales/purchases/payroll). Give them room to finish.
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
