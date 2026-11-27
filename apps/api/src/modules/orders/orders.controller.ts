import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CancelDocumentDto } from '../sales/dto/sales.dto';
import { CreatePurchaseOrderDto, CreateSalesOrderDto } from './dto/orders.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { SalesOrdersService } from './sales-orders.service';

@ApiTags('sales-orders')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get()
  @RequirePermissions('sales:view')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.orders.list(parsePage(page, pageSize), { kind, status, customerId, from, to });
  }

  @Get(':id')
  @RequirePermissions('sales:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions('sales:create')
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Post(':id/confirm')
  @RequirePermissions('sales:approve')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.confirm(id, user);
  }

  @Post(':id/convert')
  @RequirePermissions('sales:create')
  convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.convert(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales:cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, dto.reason, user);
  }
}

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions('purchases:view')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.orders.list(parsePage(page, pageSize), { status, supplierId, from, to });
  }

  @Get(':id')
  @RequirePermissions('purchases:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions('purchases:create')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Post(':id/confirm')
  @RequirePermissions('purchases:approve')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.confirm(id, user);
  }

  @Post(':id/convert')
  @RequirePermissions('purchases:create')
  convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.convert(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchases:cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, dto.reason, user);
  }
}
