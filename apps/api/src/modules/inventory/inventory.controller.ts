import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { AdjustmentDto, OpeningStockDto, TransferDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

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
