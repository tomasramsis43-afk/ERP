import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ChequesService } from './cheques.service';
import { FinancialAccountsService } from './financial-accounts.service';
import { ReconciliationService } from './reconciliation.service';
import { TreasuryController } from './treasury.controller';
import { VouchersService } from './vouchers.service';

@Module({
  imports: [AccountingModule],
  controllers: [TreasuryController],
  providers: [FinancialAccountsService, VouchersService, ChequesService, ReconciliationService],
  exports: [FinancialAccountsService, VouchersService],
})
export class TreasuryModule {}
