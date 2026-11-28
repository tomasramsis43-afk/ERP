import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CreateCustomerDto, CreateSupplierDto, UpdateCustomerDto, UpdateSupplierDto } from './dto/party.dto';
import { PartiesService } from './parties.service';
import { PartyLedgerService } from './party-ledger.service';

@ApiTags('parties')
@ApiBearerAuth()
@Controller()
export class PartiesController {
  constructor(private readonly parties: PartiesService, private readonly ledger: PartyLedgerService) {}

  @Get('customers')
  @RequirePermissions('customers:view')
  customers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('regionId') regionId?: string,
    @Query('representativeId') representativeId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.parties.listCustomers(parsePage(page, pageSize), { q: q?.trim() || undefined, regionId, representativeId }, user!);
  }

  @Get('customers/:id')
  @RequirePermissions('customers:view')
  customer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.parties.getCustomer(id, user);
  }

  @Post('customers')
  @RequirePermissions('customers:create')
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() u: AuthUser) {
    return this.parties.createCustomer(dto, u.id);
  }

  @Patch('customers/:id')
  @RequirePermissions('customers:update')
  updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() u: AuthUser) {
    return this.parties.updateCustomer(id, dto, u.id);
  }

  @Get('customers/:id/statement')
  @RequirePermissions('customers:view', 'reports:view')
  customerStatement(@Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledger.statement('CUSTOMER', id, { from, to });
  }

  @Get('customers/:id/aging')
  @RequirePermissions('customers:view', 'reports:view')
  customerAging(@Param('id', ParseUUIDPipe) id: string) {
    return this.ledger.aging('CUSTOMER', id);
  }

  @Get('suppliers')
  @RequirePermissions('suppliers:view')
  suppliers(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.parties.listSuppliers(parsePage(page, pageSize), q?.trim() || undefined);
  }

  @Get('suppliers/:id')
  @RequirePermissions('suppliers:view')
  supplier(@Param('id', ParseUUIDPipe) id: string) {
    return this.parties.getSupplier(id);
  }

  @Post('suppliers')
  @RequirePermissions('suppliers:create')
  createSupplier(@Body() dto: CreateSupplierDto, @CurrentUser() u: AuthUser) {
    return this.parties.createSupplier(dto, u.id);
  }

  @Patch('suppliers/:id')
  @RequirePermissions('suppliers:update')
  updateSupplier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() u: AuthUser) {
    return this.parties.updateSupplier(id, dto, u.id);
  }

  @Get('suppliers/:id/statement')
  @RequirePermissions('suppliers:view', 'reports:view')
  supplierStatement(@Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledger.statement('SUPPLIER', id, { from, to });
  }

  @Get('suppliers/:id/aging')
  @RequirePermissions('suppliers:view', 'reports:view')
  supplierAging(@Param('id', ParseUUIDPipe) id: string) {
    return this.ledger.aging('SUPPLIER', id);
  }
}
