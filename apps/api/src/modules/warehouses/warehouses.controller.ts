import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CreateWarehouseDto, UpdateWarehouseDto, WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermissions('inventory:view')
  list(@CurrentUser() user: AuthUser) {
    return this.warehouses.list(user);
  }

  @Post()
  @RequirePermissions('inventory:create')
  create(@Body() dto: CreateWarehouseDto, @CurrentUser() user: AuthUser) {
    return this.warehouses.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto, @CurrentUser() user: AuthUser) {
    return this.warehouses.update(id, dto, user);
  }
}
