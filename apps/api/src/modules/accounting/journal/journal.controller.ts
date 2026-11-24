import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../../common/decorators/auth.decorators';
import { CreateJournalDto, ReverseJournalDto } from '../dto/journal.dto';
import { JournalService } from './journal.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting/journal-entries')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @RequirePermissions('accounting:view')
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('status') status?: 'DRAFT' | 'POSTED',
    @Query('source') source?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journal.list({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
      status,
      source,
      from,
      to,
    });
  }

  @Get(':id')
  @RequirePermissions('accounting:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.get(id);
  }

  @Post()
  @RequirePermissions('accounting:create')
  create(@Body() dto: CreateJournalDto, @CurrentUser() user: AuthUser) {
    if (dto.post && !user.permissions.includes('accounting:approve')) {
      throw new ForbiddenException('Posting requires accounting:approve');
    }
    return this.journal.create(dto, user.id);
  }

  @Post(':id/post')
  @RequirePermissions('accounting:approve')
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.journal.postDraft(id, user.id);
  }

  @Post(':id/reverse')
  @RequirePermissions('accounting:cancel')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseJournalDto, @CurrentUser() user: AuthUser) {
    return this.journal.reverse(id, dto, user.id);
  }
}
