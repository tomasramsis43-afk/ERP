import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CreateGeoAreaDto, CreateRouteDto, UpdateRouteDto } from './dto/routes.dto';
import { RoutesService } from './routes.service';

class AssignCustomersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsUUID('all', { each: true })
  customerIds!: string[];
}

@ApiTags('routes')
@ApiBearerAuth()
@Controller()
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get('geo-areas')
  @RequirePermissions('routes:view')
  areas(@Query('level') level?: string, @Query('parentId') parentId?: string) {
    return this.routes.listAreas(level, parentId);
  }

  @Post('geo-areas')
  @RequirePermissions('routes:create')
  createArea(@Body() dto: CreateGeoAreaDto, @CurrentUser() u: AuthUser) {
    return this.routes.createArea(dto, u.id);
  }

  @Get('routes')
  @RequirePermissions('routes:view')
  list() {
    return this.routes.listRoutes();
  }

  @Get('routes/:id')
  @RequirePermissions('routes:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.getRoute(id);
  }

  @Post('routes')
  @RequirePermissions('routes:create')
  create(@Body() dto: CreateRouteDto, @CurrentUser() u: AuthUser) {
    return this.routes.createRoute(dto, u.id);
  }

  @Patch('routes/:id')
  @RequirePermissions('routes:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteDto, @CurrentUser() u: AuthUser) {
    return this.routes.updateRoute(id, dto, u.id);
  }

  @Post('routes/:id/customers')
  @RequirePermissions('routes:update', 'customers:update')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCustomersDto, @CurrentUser() u: AuthUser) {
    return this.routes.assignCustomers(id, dto.customerIds, u.id);
  }
}
