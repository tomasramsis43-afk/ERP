import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../../common/decorators/auth.decorators';
import { CreateRecurringJournalDto } from '../dto/recurring-journal.dto';
import { RecurringJournalsService } from './recurring-journals.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/recurring')
export class RecurringJournalsController {
  constructor(private readonly service: RecurringJournalsService) {}

  @Get()
  @RequirePermissions('accounting:view')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions('accounting:approve')
  create(@Body() dto: CreateRecurringJournalDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  /** Run one template early or replay a specific date (idempotent). */
  @Post(':id/run')
  @RequirePermissions('accounting:approve')
  run(@Param('id', ParseUUIDPipe) id: string, @Query('date') date: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.run(id, date, user.id);
  }

  /** Post all templates whose nextRunDate has arrived. */
  @Post('run-due')
  @RequirePermissions('accounting:approve')
  runDue(@CurrentUser() user: AuthUser) {
    return this.service.runDue(new Date(), user.id);
  }
}
