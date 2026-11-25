import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { SystemAccountsService } from './accounts/system-accounts.service';
import { JournalController } from './journal/journal.controller';
import { JournalPostingService } from './journal/journal-posting.service';
import { JournalService } from './journal/journal.service';
import { LedgerReportsController } from './reports/ledger-reports.controller';
import { LedgerReportsService } from './reports/ledger-reports.service';

@Module({
  controllers: [AccountsController, JournalController, LedgerReportsController],
  providers: [AccountsService, JournalService, JournalPostingService, LedgerReportsService, SystemAccountsService],
  // Other domain modules (sales, purchases, treasury...) import this module and post via JournalPostingService.
  exports: [JournalPostingService, SystemAccountsService, LedgerReportsService],
})
export class AccountingModule {}
