import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CancelDocumentDto } from '../sales/dto/sales.dto';
import { CreatePurchaseInvoiceDto } from './dto/purchases.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('invoices')
  @RequirePermissions('purchases:view')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: 'PURCHASE' | 'RETURN',
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.purchases.list(parsePage(page, pageSize), { kind, supplierId, status, from, to });
  }

  @Get('invoices/:id')
  @RequirePermissions('purchases:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Post('invoices')
  @RequirePermissions('purchases:create')
  create(@Body() dto: CreatePurchaseInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.purchases.createInvoice(dto, user);
  }

  @Post('returns')
  @RequirePermissions('purchases:create')
  createReturn(@Body() dto: CreatePurchaseInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.purchases.createReturn(dto, user);
  }

  @Post('invoices/:id/cancel')
  @RequirePermissions('purchases:cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto, @CurrentUser() user: AuthUser) {
    return this.purchases.cancel(id, dto.reason, user);
  }
}
