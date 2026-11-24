import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../../common/decorators/auth.decorators';
import { CreateAccountDto, UpdateAccountDto } from '../dto/account.dto';
import { AccountsService } from './accounts.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions('accounting:view')
  list(@Query('q') q?: string) {
    return this.accounts.list(q?.trim() || undefined);
  }

  @Post()
  @RequirePermissions('accounting:create')
  create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthUser) {
    return this.accounts.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('accounting:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto, @CurrentUser() user: AuthUser) {
    return this.accounts.update(id, dto, user.id);
  }
}
