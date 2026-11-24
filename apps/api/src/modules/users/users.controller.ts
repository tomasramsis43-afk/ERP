import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CreateUserDto, UpdateUserStatusDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:view')
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.users.list(Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(pageSize) || 25)));
  }

  @Post()
  @RequirePermissions('users:create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id/status')
  @RequirePermissions('users:update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setActive(id, dto.isActive, dto.reason, actor.id);
  }
}
