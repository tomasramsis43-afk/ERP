import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { ChequesService } from './cheques.service';
import {
  BounceChequeDto,
  CancelVoucherDto,
  CreateFinancialAccountDto,
  CreateVoucherDto,
  IncomingChequeDto,
  OutgoingChequeDto,
  ReconcileDto,
  SettleChequeDto,
} from './dto/treasury.dto';
import { FinancialAccountsService } from './financial-accounts.service';
import { ReconciliationService } from './reconciliation.service';
import { VouchersService } from './vouchers.service';

@ApiTags('treasury')
@ApiBearerAuth()
@Controller()
export class TreasuryController {
  constructor(
    private readonly accounts: FinancialAccountsService,
    private readonly vouchers: VouchersService,
    private readonly cheques: ChequesService,
    private readonly recon: ReconciliationService,
  ) {}

  // ---- cash boxes and bank accounts ------------------------------------

  @Get('financial-accounts')
  @RequirePermissions('treasury:view')
  listAccounts() {
    return this.accounts.list();
  }

  @Get('financial-accounts/:id')
  @RequirePermissions('treasury:view')
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.get(id);
  }

  @Post('financial-accounts')
  @RequirePermissions('treasury:create')
  createAccount(@Body() dto: CreateFinancialAccountDto, @CurrentUser() u: AuthUser) {
    return this.accounts.create(dto, u.id);
  }

  // ---- vouchers --------------------------------------------------------

  @Get('treasury/vouchers')
  @RequirePermissions('treasury:view')
  listVouchers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('financialAccountId') financialAccountId?: string,
    @Query('partyId') partyId?: string,
    @Query('representativeId') representativeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.vouchers.list(parsePage(page, pageSize), { type, financialAccountId, partyId, representativeId, status, from, to });
  }

  @Get('treasury/vouchers/:id')
  @RequirePermissions('treasury:view')
  getVoucher(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.get(id);
  }

  @Post('treasury/vouchers')
  @RequirePermissions('treasury:create')
  createVoucher(@Body() dto: CreateVoucherDto, @CurrentUser() u: AuthUser) {
    return this.vouchers.create(dto, u.id);
  }

  @Post('treasury/vouchers/:id/cancel')
  @RequirePermissions('treasury:cancel')
  cancelVoucher(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelVoucherDto, @CurrentUser() u: AuthUser) {
    return this.vouchers.cancel(id, dto.reason, u.id);
  }

  // ---- cheques ---------------------------------------------------------

  @Get('treasury/cheques')
  @RequirePermissions('treasury:view')
  listCheques(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('direction') direction?: 'INCOMING' | 'OUTGOING',
    @Query('status') status?: string,
    @Query('partyId') partyId?: string,
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
  ) {
    return this.cheques.list(parsePage(page, pageSize), { direction, status, partyId, dueFrom, dueTo });
  }

  @Post('treasury/cheques/incoming')
  @RequirePermissions('treasury:create')
  receiveCheque(@Body() dto: IncomingChequeDto, @CurrentUser() u: AuthUser) {
    return this.cheques.receive(dto, u.id);
  }

  @Post('treasury/cheques/outgoing')
  @RequirePermissions('treasury:create')
  issueCheque(@Body() dto: OutgoingChequeDto, @CurrentUser() u: AuthUser) {
    return this.cheques.issue(dto, u.id);
  }

  @Post('treasury/cheques/:id/settle')
  @RequirePermissions('treasury:update')
  settleCheque(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleChequeDto, @CurrentUser() u: AuthUser) {
    return this.cheques.settle(id, dto, u.id);
  }

  @Post('treasury/cheques/:id/bounce')
  @RequirePermissions('treasury:update')
  bounceCheque(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BounceChequeDto, @CurrentUser() u: AuthUser) {
    return this.cheques.bounce(id, dto, u.id);
  }

  // ---- bank reconciliation --------------------------------------------

  @Get('banks/:id/unreconciled')
  @RequirePermissions('banks:view')
  unreconciled(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.recon.unreconciled(id, parsePage(page, pageSize, 100, 500));
  }

  @Get('banks/:id/reconciliations')
  @RequirePermissions('banks:view')
  reconciliations(@Param('id', ParseUUIDPipe) id: string) {
    return this.recon.history(id);
  }

  @Post('banks/:id/reconcile')
  @RequirePermissions('banks:update')
  reconcile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileDto, @CurrentUser() u: AuthUser) {
    return this.recon.reconcile(id, dto, u.id);
  }
}
