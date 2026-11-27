import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toDate } from '../accounting/dto/journal.dto';
import { CreateGeoAreaDto, CreateRouteDto, LogVisitDto, UpdateRouteDto, VisitQueryDto } from './dto/routes.dto';

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

  // ---- visit plan and visit log ------------------------------------------

  /** Sets the visiting order of a route: array position becomes the sequence number (1-based). */
  async setSequence(routeId: string, customerIds: string[], actorId: string) {
    if (new Set(customerIds).size !== customerIds.length) throw new BadRequestException('Duplicate customers in the sequence');
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } });
    if (!route) throw new NotFoundException('Route not found');
    const onRoute = await this.prisma.customer.findMany({ where: { id: { in: customerIds }, routeId }, select: { id: true } });
    if (onRoute.length !== customerIds.length) throw new BadRequestException('Every customer in the sequence must belong to this route');
    await this.prisma.$transaction(
      customerIds.map((id, i) => this.prisma.customer.update({ where: { id }, data: { routeSequence: i + 1 } })),
    );
    await this.audit.record({ userId: actorId, action: 'SET_SEQUENCE', entity: 'Route', entityId: routeId, newData: { customers: customerIds.length } });
    return { updated: customerIds.length };
  }

  /** Logs (or corrects) the visit of a representative to a customer for a day: one record per representative, customer and day. */
  async logVisit(dto: LogVisitDto, actorId: string) {
    const today = toDate(new Date().toISOString());
    const visitDate = dto.visitDate ? toDate(dto.visitDate) : today;
    if (visitDate > today) throw new BadRequestException('Cannot log a visit in the future');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive');

    let representativeId = dto.representativeId;
    if (!representativeId) {
      const own = await this.prisma.representative.findFirst({ where: { userId: actorId, isActive: true }, select: { id: true } });
      representativeId = own?.id ?? customer.representativeId ?? undefined;
    }
    if (!representativeId) throw new BadRequestException('No representative could be determined for this visit');
    const rep = await this.prisma.representative.findUnique({ where: { id: representativeId } });
    if (!rep || !rep.isActive) throw new BadRequestException('Representative not found or inactive');

    const routeId = customer.routeId ?? rep.routeId ?? null;
    const key = { representativeId_customerId_visitDate: { representativeId, customerId: customer.id, visitDate } };
    const visit = await this.prisma.routeVisit.upsert({
      where: key,
      create: { routeId, customerId: customer.id, representativeId, visitDate, outcome: dto.outcome, note: dto.note, createdById: actorId },
      update: { outcome: dto.outcome, note: dto.note, routeId, visitedAt: new Date() },
    });
    await this.audit.record({
      userId: actorId, action: 'LOG_VISIT', entity: 'RouteVisit', entityId: visit.id,
      newData: { customerId: customer.id, representativeId, visitDate: visitDate.toISOString().slice(0, 10), outcome: dto.outcome },
    });
    return visit;
  }

  listVisits(q: VisitQueryDto) {
    return this.prisma.routeVisit.findMany({
      where: {
        ...(q.routeId ? { routeId: q.routeId } : {}),
        ...(q.representativeId ? { representativeId: q.representativeId } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...((q.from || q.to) ? { visitDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}),
      },
      orderBy: [{ visitDate: 'desc' }, { visitedAt: 'desc' }],
      take: 500,
      include: { customer: { select: { id: true, code: true, nameAr: true } }, representative: { select: { id: true, code: true, nameAr: true } } },
    });
  }

  /** Who of a route's active customers was visited on a day and who was not (in visiting order). */
  async coverage(routeId: string, date?: string) {
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true, code: true, nameAr: true, nameEn: true } });
    if (!route) throw new NotFoundException('Route not found');
    const day = date ? toDate(date) : toDate(new Date().toISOString());
    const [customers, visits] = await Promise.all([
      this.prisma.customer.findMany({
        where: { routeId, isActive: true },
        select: { id: true, code: true, nameAr: true, routeSequence: true },
        orderBy: [{ routeSequence: { sort: 'asc', nulls: 'last' } }, { nameAr: 'asc' }],
      }),
      this.prisma.routeVisit.findMany({ where: { routeId, visitDate: day }, orderBy: { visitedAt: 'desc' } }),
    ]);
    const byCustomer = new Map<string, (typeof visits)[number]>();
    for (const v of visits) if (!byCustomer.has(v.customerId)) byCustomer.set(v.customerId, v);
    const rows = customers.map((c) => {
      const v = byCustomer.get(c.id);
      return { customerId: c.id, code: c.code, nameAr: c.nameAr, sequence: c.routeSequence, visited: Boolean(v), outcome: v?.outcome ?? null, visitedAt: v?.visitedAt ?? null };
    });
    const visited = rows.filter((r) => r.visited).length;
    return { route, date: day.toISOString().slice(0, 10), total: rows.length, visited, notVisited: rows.length - visited, rows };
  }
}
