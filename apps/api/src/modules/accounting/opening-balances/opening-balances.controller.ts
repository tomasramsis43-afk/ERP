import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../../common/decorators/auth.decorators';
import { CreateOpeningBalancesDto } from '../dto/opening-balance.dto';
import { OpeningBalancesService } from './opening-balances.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/opening-balances')
export class OpeningBalancesController {
  constructor(private readonly openingBalances: OpeningBalancesService) {}

  /** Posts tagged customer/supplier opening balances as one balanced journal entry. */
  @Post()
  @RequirePermissions('accounting:approve')
  create(@Body() dto: CreateOpeningBalancesDto, @CurrentUser() user: AuthUser) {
    return this.openingBalances.create(dto, user.id);
  }
}
