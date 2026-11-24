import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:view')
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(200, Math.max(1, Number(pageSize) || 50));
    return this.audit.list({ page: p, pageSize: size, entity, userId });
  }
}
