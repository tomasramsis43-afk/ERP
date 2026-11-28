import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CancelDocumentDto, CreateSalesInvoiceDto, CreateSalesOrderDto, CreateSalesReturnDto } from './dto/sales.dto';
import { SalesOrdersService } from './sales-orders.service';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly orders: SalesOrdersService,
  ) {}

  @Get('orders')
  @RequirePermissions('sales:view')
  listOrders(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('customerId') customerId?: string, @Query('status') status?: string, @Query('kind') kind?: string) {
    return this.orders.list(parsePage(page, pageSize), { customerId, status, kind });
  }

  @Get('orders/:id')
  @RequirePermissions('sales:view')
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post('orders')
  @RequirePermissions('sales:create')
  createOrder(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Post('orders/:id/confirm')
  @RequirePermissions('sales:create')
  confirmOrder(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.confirm(id, user);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('sales:cancel')
  cancelOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, dto.reason, user);
  }

  @Get('invoices')
  @RequirePermissions('sales:view')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: 'SALE' | 'RETURN',
    @Query('customerId') customerId?: string,
    @Query('representativeId') representativeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.sales.list(parsePage(page, pageSize), { kind, customerId, representativeId, status, from, to }, user!);
  }

  @Get('invoices/:id')
  @RequirePermissions('sales:view')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sales.get(id, user);
  }

  @Post('invoices')
  @RequirePermissions('sales:create')
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.sales.createInvoice(dto, user);
  }

  @Post('returns')
  @RequirePermissions('sales:create', 'sales:approve_return')
  createReturn(@Body() dto: CreateSalesReturnDto, @CurrentUser() user: AuthUser) {
    return this.sales.createReturn(dto, user);
  }

  @Post('invoices/:id/cancel')
  @RequirePermissions('sales:cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto, @CurrentUser() user: AuthUser) {
    return this.sales.cancel(id, dto.reason, user);
  }
}
