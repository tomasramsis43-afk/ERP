import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { ClosingService } from './closing.service';
import { CommissionsService } from './commissions.service';
import {
  CloseDayDto,
  CreateCommissionRuleDto,
  CreateRepresentativeDto,
  PayCommissionsDto,
  UpdateRepresentativeDto,
} from './dto/representatives.dto';
import { MonitorService } from './monitor.service';
import { RepresentativesService } from './representatives.service';

@ApiTags('representatives')
@ApiBearerAuth()
@Controller('representatives')
export class RepresentativesController {
  constructor(
    private readonly reps: RepresentativesService,
    private readonly closing: ClosingService,
    private readonly commissions: CommissionsService,
    private readonly monitor: MonitorService,
  ) {}

  /** Declared before any `:id` route so "monitor" is not parsed as an id. */
  @Get('monitor')
  @RequirePermissions('representatives:view')
  monitorDay(@Query('date') date?: string) {
    return this.monitor.day(date);
  }

  @Get()
  @RequirePermissions('representatives:view')
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.reps.list(parsePage(page, pageSize), q?.trim() || undefined);
  }

  /** The logged-in representative's own profile (mobile app). */
  @Get('me')
  @RequirePermissions('representatives:view')
  me(@CurrentUser() u: AuthUser) {
    return this.reps.forUser(u.id);
  }

  @Get('commission-rules')
  @RequirePermissions('representatives:view')
  rules() {
    return this.reps.listRules();
  }

  @Post('commission-rules')
  @RequirePermissions('representatives:approve')
  createRule(@Body() dto: CreateCommissionRuleDto, @CurrentUser() u: AuthUser) {
    return this.reps.createRule(dto, u.id);
  }

  @Post('commission-rules/:id/deactivate')
  @RequirePermissions('representatives:approve')
  deactivateRule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.reps.deactivateRule(id, u.id);
  }

  @Get('closings/:closingId')
  @RequirePermissions('representatives:view')
  closingById(@Param('closingId', ParseUUIDPipe) closingId: string) {
    return this.closing.get(closingId);
  }

  @Get(':id')
  @RequirePermissions('representatives:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.reps.get(id);
  }

  @Post()
  @RequirePermissions('representatives:create')
  create(@Body() dto: CreateRepresentativeDto, @CurrentUser() u: AuthUser) {
    return this.reps.create(dto, u.id);
  }

  @Patch(':id')
  @RequirePermissions('representatives:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRepresentativeDto, @CurrentUser() u: AuthUser) {
    return this.reps.update(id, dto, u.id);
  }

  // ---- daily closing: a representative may only touch their own (enforced in the service) ----

  @Get(':id/closing-preview')
  @RequirePermissions('representatives:view')
  preview(@Param('id', ParseUUIDPipe) id: string, @Query('date') date: string, @CurrentUser() u: AuthUser) {
    return this.closing.preview(id, date, u);
  }

  @Post(':id/close-day')
  @RequirePermissions('representatives:view')
  closeDay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseDayDto, @CurrentUser() u: AuthUser) {
    return this.closing.close(id, dto, u);
  }

  @Get(':id/closings')
  @RequirePermissions('representatives:view')
  closings(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.closing.list(id, parsePage(page, pageSize));
  }

  // ---- commissions ----

  @Get(':id/commissions')
  @RequirePermissions('representatives:view')
  commissionList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('paid') paid?: string,
  ) {
    return this.commissions.list(id, parsePage(page, pageSize), paid);
  }

  @Post(':id/commissions/pay')
  @RequirePermissions('representatives:approve', 'treasury:create')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayCommissionsDto, @CurrentUser() u: AuthUser) {
    return this.commissions.pay(id, dto, u.id);
  }
}
