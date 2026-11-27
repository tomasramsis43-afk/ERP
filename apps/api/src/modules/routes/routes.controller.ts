import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CoverageQueryDto, CreateGeoAreaDto, CreateRouteDto, LogVisitDto, SetSequenceDto, UpdateRouteDto, VisitQueryDto } from './dto/routes.dto';
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

  // Static `routes/visits` paths are declared before `routes/:id`.
  @Post('routes/visits')
  @RequirePermissions('routes:log_visit')
  logVisit(@Body() dto: LogVisitDto, @CurrentUser() u: AuthUser) {
    return this.routes.logVisit(dto, u.id);
  }

  @Get('routes/visits')
  @RequirePermissions('routes:view')
  visits(@Query() q: VisitQueryDto) {
    return this.routes.listVisits(q);
  }

  @Get('routes/:id/coverage')
  @RequirePermissions('routes:view')
  coverage(@Param('id', ParseUUIDPipe) id: string, @Query() q: CoverageQueryDto) {
    return this.routes.coverage(id, q.date);
  }

  @Put('routes/:id/sequence')
  @RequirePermissions('routes:update')
  sequence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSequenceDto, @CurrentUser() u: AuthUser) {
    return this.routes.setSequence(id, dto.customerIds, u.id);
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
