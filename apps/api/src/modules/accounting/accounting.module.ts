import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { SystemAccountsService } from './accounts/system-accounts.service';
import { JournalController } from './journal/journal.controller';
import { JournalPostingService } from './journal/journal-posting.service';
import { JournalService } from './journal/journal.service';
import { LedgerReportsController } from './reports/ledger-reports.controller';
import { LedgerReportsService } from './reports/ledger-reports.service';
import { OpeningBalancesController } from './opening-balances/opening-balances.controller';
import { OpeningBalancesService } from './opening-balances/opening-balances.service';
import { YearEndController } from './year-end/year-end.controller';
import { YearEndService } from './year-end/year-end.service';

@Module({
  controllers: [AccountsController, JournalController, LedgerReportsController, OpeningBalancesController, YearEndController],
  providers: [AccountsService, JournalService, JournalPostingService, LedgerReportsService, SystemAccountsService, OpeningBalancesService, YearEndService],
  // Other domain modules (sales, purchases, treasury...) import this module and post via JournalPostingService.
  exports: [JournalPostingService, SystemAccountsService, LedgerReportsService],
})
export class AccountingModule {}
