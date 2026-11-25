import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateGeoAreaDto, CreateRouteDto, UpdateRouteDto } from './dto/routes.dto';

const PARENT_LEVEL = { CITY: null, REGION: 'CITY', DISTRICT: 'REGION' } as const;

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---- cities / regions / districts ------------------------------------

  listAreas(level?: string, parentId?: string) {
    return this.prisma.geoArea.findMany({
      where: {
        ...(level === 'CITY' || level === 'REGION' || level === 'DISTRICT' ? { level } : {}),
        ...(parentId ? { parentId } : {}),
      },
      orderBy: [{ level: 'asc' }, { nameEn: 'asc' }],
    });
  }

  async createArea(dto: CreateGeoAreaDto, actorId: string) {
    const expectedParent = PARENT_LEVEL[dto.level];
    if (expectedParent === null) {
      if (dto.parentId) throw new BadRequestException('A city has no parent');
    } else {
      if (!dto.parentId) throw new BadRequestException(`A ${dto.level.toLowerCase()} needs a parent ${expectedParent.toLowerCase()}`);
      const parent = await this.prisma.geoArea.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.level !== expectedParent) {
        throw new BadRequestException(`Parent must be a ${expectedParent.toLowerCase()}`);
      }
    }
    const area = await this.prisma.geoArea.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'GeoArea', entityId: area.id, newData: { level: area.level, nameEn: area.nameEn } });
    return area;
  }

  // ---- routes ----------------------------------------------------------

  async listRoutes() {
    const routes = await this.prisma.route.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { customers: true, representatives: true } } },
    });
    return routes;
  }

  async getRoute(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        _count: { select: { customers: true } },
        representatives: { select: { id: true, code: true, nameAr: true } },
        vehicles: { select: { id: true, plateNumber: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async createRoute(dto: CreateRouteDto, actorId: string) {
    if (await this.prisma.route.findUnique({ where: { code: dto.code } })) throw new ConflictException('Route code already exists');
    await this.assertArea(dto.geoAreaId);
    const route = await this.prisma.route.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Route', entityId: route.id, newData: { code: route.code } });
    return route;
  }

  async updateRoute(id: string, dto: UpdateRouteDto, actorId: string) {
    const existing = await this.prisma.route.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Route not found');
    await this.assertArea(dto.geoAreaId);
    if (dto.isActive === false) {
      const active = await this.prisma.representative.count({ where: { routeId: id, isActive: true } });
      if (active) throw new ConflictException('Reassign the active representatives before deactivating this route');
    }
    const route = await this.prisma.route.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Route',
      entityId: id,
      oldData: { isActive: existing.isActive, geoAreaId: existing.geoAreaId },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return route;
  }

  /** Bulk-assign customers to a route (and optionally the route's representative). */
  async assignCustomers(routeId: string, customerIds: string[], actorId: string) {
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, include: { representatives: { where: { isActive: true }, take: 2 } } });
    if (!route || !route.isActive) throw new BadRequestException('Route not found or inactive');
    const result = await this.prisma.customer.updateMany({ where: { id: { in: customerIds } }, data: { routeId } });
    await this.audit.record({ userId: actorId, action: 'ASSIGN_CUSTOMERS', entity: 'Route', entityId: routeId, newData: { requested: customerIds.length, updated: result.count } });
    return { updated: result.count };
  }

  private async assertArea(id?: string): Promise<void> {
    if (id && !(await this.prisma.geoArea.findUnique({ where: { id }, select: { id: true } }))) {
      throw new BadRequestException('Area not found');
    }
  }
}
