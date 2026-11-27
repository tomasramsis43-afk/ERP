import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../../common/decorators/auth.decorators';
import { YearEndService } from './year-end.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/year-end')
export class YearEndController {
  constructor(private readonly yearEnd: YearEndService) {}

  /** What closing would do: the revenue/expense balances and the net result. No data is written. */
  @Get(':periodId/preview')
  @RequirePermissions('accounting:view')
  preview(@Param('periodId', ParseUUIDPipe) periodId: string) {
    return this.yearEnd.preview(periodId);
  }

  @Post(':periodId/close')
  @RequirePermissions('accounting:approve')
  close(@Param('periodId', ParseUUIDPipe) periodId: string, @CurrentUser() user: AuthUser) {
    return this.yearEnd.close(periodId, user);
  }
}
