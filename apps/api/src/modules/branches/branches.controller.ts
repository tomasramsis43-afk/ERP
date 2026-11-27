import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions('branches:view')
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @CurrentUser() user: AuthUser) {
    return this.branches.list(Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(pageSize) || 25)), user);
  }

  @Get(':id')
  @RequirePermissions('branches:view')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.branches.get(id, user);
  }

  @Post()
  @RequirePermissions('branches:create')
  create(@Body() dto: CreateBranchDto, @CurrentUser() user: AuthUser) {
    return this.branches.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('branches:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthUser) {
    return this.branches.update(id, dto, user);
  }
}
