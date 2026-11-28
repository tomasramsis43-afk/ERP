import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PushDto } from './dto/sync.dto';
import { PullQueryDto } from './dto/pull-query.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { RepReportService } from './rep-report.service';
import { SnapshotService } from './snapshot.service';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly snapshot: SnapshotService,
    private readonly reports: RepReportService,
  ) {}

  /** Idempotent batch upload of offline operations; always answers 200 with a per-operation result. */
  @Post('push')
  @HttpCode(200)
  @RequirePermissions('sales:create')
  push(@Body() dto: PushDto, @CurrentUser() user: AuthUser) {
    return this.sync.push(dto, user);
  }

  @Get('pull')
  @RequirePermissions('sales:view')
  pull(@CurrentUser() user: AuthUser, @Query() q: PullQueryDto) {
    return this.snapshot.pull(user.id, q.productsSince);
  }

  /** Online only: the statement, balance and aging of one of the representative's customers. */
  @Get('customers/:id/statement')
  @RequirePermissions('sales:view')
  statement(@Param('id', ParseUUIDPipe) id: string, @Query() q: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.customerStatement(user.id, id, q.from, q.to);
  }

  /** Online only: the representative's own sales, collections, expenses, commission and visits for a date range. */
  @Get('me/report')
  @RequirePermissions('sales:view')
  myReport(@Query() q: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.myReport(user.id, q.from, q.to);
  }
}
