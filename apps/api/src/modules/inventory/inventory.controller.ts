import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { AdjustmentDto, OpeningStockDto, TransferDto } from './dto/inventory.dto';
import { CreateStockCountDto, SetCountsDto } from './dto/stock-count.dto';
import { InventoryService } from './inventory.service';
import { StockCountsService } from './stock-counts.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly counts: StockCountsService,
  ) {}

  @Get('counts')
  @RequirePermissions('inventory:view')
  listCounts(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('warehouseId') warehouseId?: string, @Query('status') status?: string) {
    return this.counts.list(parsePage(page, pageSize, 20, 100), { warehouseId, status });
  }

  @Get('counts/:id')
  @RequirePermissions('inventory:view')
  getCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.get(id);
  }

  @Post('counts')
  @RequirePermissions('inventory:create')
  createCount(@Body() dto: CreateStockCountDto, @CurrentUser() u: AuthUser) {
    return this.counts.create(dto, u.id);
  }

  @Put('counts/:id/lines')
  @RequirePermissions('inventory:update')
  setCountLines(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCountsDto, @CurrentUser() u: AuthUser) {
    return this.counts.setCounts(id, dto, u.id);
  }

  @Post('counts/:id/approve')
  @RequirePermissions('inventory:approve')
  approveCount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.counts.approve(id, u.id);
  }

  @Post('counts/:id/cancel')
  @RequirePermissions('inventory:update')
  cancelCount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.counts.cancel(id, u.id);
  }

  @Get('balances')
  @RequirePermissions('inventory:view')
  balances(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('lowOnly') lowOnly?: string,
  ) {
    return this.inventory.balances(parsePage(page, pageSize, 50, 200), {
      warehouseId,
      productId,
      lowOnly: lowOnly === 'true',
    });
  }

  /** Batch/lot layers and expiry watch list. */
  @Get('batches')
  @RequirePermissions('inventory:view')
  batches(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('expiringWithinDays') expiringWithinDays?: string,
  ) {
    const days = expiringWithinDays ? Number(expiringWithinDays) : undefined;
    return this.inventory.batches(parsePage(page, pageSize, 50, 200), {
      warehouseId,
      productId,
      expiringWithinDays: days && days > 0 ? days : undefined,
    });
  }

  @Get('movements')
  @RequirePermissions('inventory:view')
  movements(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventory.movements(parsePage(page, pageSize, 50, 200), { warehouseId, productId, from, to });
  }

  @Post('transfers')
  @RequirePermissions('inventory:create')
  transfer(@Body() dto: TransferDto, @CurrentUser() u: AuthUser) {
    return this.inventory.transfer(dto, u.id);
  }

  @Post('opening-stock')
  @RequirePermissions('inventory:approve')
  opening(@Body() dto: OpeningStockDto, @CurrentUser() u: AuthUser) {
    return this.inventory.openingStock(dto, u.id);
  }

  @Post('adjustments')
  @RequirePermissions('inventory:approve')
  adjust(@Body() dto: AdjustmentDto, @CurrentUser() u: AuthUser) {
    return this.inventory.adjust(dto, u.id);
  }
}
