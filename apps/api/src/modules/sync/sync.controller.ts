import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PushDto } from './dto/sync.dto';
import { SnapshotService } from './snapshot.service';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly snapshot: SnapshotService,
  ) {}

  /** Idempotent batch upload of offline operations; always answers 200 with a per-operation result. */
  @Post('push')
  @RequirePermissions('sales:create')
  push(@Body() dto: PushDto, @CurrentUser() user: AuthUser) {
    return this.sync.push(dto, user);
  }

  @Get('pull')
  @RequirePermissions('sales:view')
  pull(@CurrentUser() user: AuthUser, @Query('since') since?: string) {
    return this.snapshot.pull(user.id, since);
  }
}
