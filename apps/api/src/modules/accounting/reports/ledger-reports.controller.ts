import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/auth.decorators';
import { LedgerReportsService } from './ledger-reports.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/reports')
export class LedgerReportsController {
  constructor(private readonly reports: LedgerReportsService) {}

  @Get('trial-balance')
  @RequirePermissions('accounting:view', 'reports:view')
  trialBalance(@Query('asOf') asOf?: string) {
    return this.reports.trialBalance(asOf);
  }

  @Get('ledger/:accountId')
  @RequirePermissions('accounting:view', 'reports:view')
  ledger(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.reports.accountLedger(accountId, {
      from,
      to,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(200, Math.max(1, Number(pageSize) || 50)),
    });
  }
}
