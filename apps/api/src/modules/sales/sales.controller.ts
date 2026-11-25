import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CancelDocumentDto, CreateSalesInvoiceDto, CreateSalesReturnDto } from './dto/sales.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

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
  ) {
    return this.sales.list(parsePage(page, pageSize), { kind, customerId, representativeId, status, from, to });
  }

  @Get('invoices/:id')
  @RequirePermissions('sales:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(id);
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
