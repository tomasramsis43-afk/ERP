import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CreateVehicleDto, UpdateVehicleDto, VehicleExpenseDto } from './dto/vehicles.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  /** `expiringInDays` lists vehicles whose license or insurance expires within that many days (or already did). */
  @Get()
  @RequirePermissions('vehicles:view')
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('expiringInDays') expiringInDays?: string) {
    const days = expiringInDays !== undefined && expiringInDays !== '' ? Math.max(0, Number(expiringInDays) || 0) : undefined;
    return this.vehicles.list(parsePage(page, pageSize), days);
  }

  @Get(':id')
  @RequirePermissions('vehicles:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.get(id);
  }

  @Post()
  @RequirePermissions('vehicles:create')
  create(@Body() dto: CreateVehicleDto, @CurrentUser() u: AuthUser) {
    return this.vehicles.create(dto, u.id);
  }

  @Patch(':id')
  @RequirePermissions('vehicles:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() u: AuthUser) {
    return this.vehicles.update(id, dto, u.id);
  }

  @Get(':id/expenses')
  @RequirePermissions('vehicles:view')
  expenses(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.vehicles.expenses(id, parsePage(page, pageSize), { category, from, to });
  }

  @Post(':id/expenses')
  @RequirePermissions('vehicles:update', 'treasury:create')
  addExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VehicleExpenseDto, @CurrentUser() u: AuthUser) {
    return this.vehicles.recordExpense(id, dto, u.id);
  }
}
