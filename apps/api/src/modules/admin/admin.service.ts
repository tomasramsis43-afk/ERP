import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface SettingInput {
  key: string;
  value: Prisma.InputJsonValue;
}

/** System settings, fiscal periods and role/permission administration. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- settings --------------------------------------------------------

  listSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async updateSettings(items: SettingInput[], actorId: string) {
    if (items.length === 0) return [];
    for (const item of items) {
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(item.key)) throw new BadRequestException(`Invalid setting key: ${item.key}`);
    }
    const saved = await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.setting.upsert({
          where: { key: i.key },
          update: { value: i.value },
          create: { key: i.key, value: i.value },
        }),
      ),
    );
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Setting',
      newData: { keys: items.map((i) => i.key) },
    });
    return saved;
  }

  // ---- fiscal periods --------------------------------------------------

  listPeriods() {
    return this.prisma.fiscalPeriod.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { entries: true } } },
    });
  }

  async createPeriod(dto: { name: string; startDate: string; endDate: string }, actorId: string) {
    const startDate = new Date(`${dto.startDate.slice(0, 10)}T00:00:00.000Z`);
    const endDate = new Date(`${dto.endDate.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new BadRequestException('Invalid dates');
    if (startDate > endDate) throw new BadRequestException('The period starts after it ends');
    const overlap = await this.prisma.fiscalPeriod.count({
      where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (overlap) throw new ConflictException('This period overlaps an existing fiscal period');
    const period = await this.prisma.fiscalPeriod.create({ data: { name: dto.name, startDate, endDate } });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'FiscalPeriod', entityId: period.id, newData: { name: period.name } });
    return period;
  }

  async updatePeriod(id: string, dto: { name?: string; status?: 'OPEN' | 'CLOSED' }, actorId: string) {
    const existing = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fiscal period not found');
    if (dto.status === 'CLOSED' && existing.status !== 'CLOSED') {
      const drafts = await this.prisma.journalEntry.count({ where: { periodId: id, status: 'DRAFT' } });
      if (drafts) throw new ConflictException(`Post or delete the ${drafts} draft entries in this period first`);
    }
    const period = await this.prisma.fiscalPeriod.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.status ? { status: dto.status } : {}) },
    });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'FiscalPeriod',
      entityId: id,
      oldData: { name: existing.name, status: existing.status },
      newData: { name: period.name, status: period.status },
    });
    return period;
  }

  // ---- roles & permissions ---------------------------------------------

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: { select: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissionCodes: r.permissions.map((p) => p.permission.code).sort(),
    }));
  }

  async createRole(dto: { code: string; nameAr: string; nameEn: string; permissionCodes?: string[] }, actorId: string) {
    if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(dto.code)) throw new BadRequestException('Role code must be UPPER_SNAKE_CASE');
    if (await this.prisma.role.findUnique({ where: { code: dto.code } })) throw new ConflictException('Role code already exists');
    const permissionIds = await this.resolvePermissions(dto.permissionCodes ?? []);
    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Role', entityId: role.id, newData: { code: role.code } });
    return this.listRoles().then((rows) => rows.find((r) => r.id === role.id));
  }

  async updateRole(id: string, dto: { nameAr?: string; nameEn?: string; permissionCodes?: string[] }, actorId: string) {
    const existing = await this.prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.code === 'SYSTEM_ADMIN' && dto.permissionCodes) {
      throw new BadRequestException('The system administrator always keeps every permission');
    }
    const permissionIds = dto.permissionCodes ? await this.resolvePermissions(dto.permissionCodes) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { ...(dto.nameAr ? { nameAr: dto.nameAr } : {}), ...(dto.nameEn ? { nameEn: dto.nameEn } : {}) },
      });
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length) {
          await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) });
        }
      }
    });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Role',
      entityId: id,
      oldData: { permissionCodes: existing.permissions.length },
      newData: { permissionCodes: dto.permissionCodes?.length ?? existing.permissions.length },
    });
    return this.listRoles().then((rows) => rows.find((r) => r.id === id));
  }

  private async resolvePermissions(codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return [];
    const found = await this.prisma.permission.findMany({ where: { code: { in: unique } }, select: { id: true, code: true } });
    if (found.length !== unique.length) {
      const missing = unique.filter((c) => !found.some((f) => f.code === c));
      throw new BadRequestException(`Unknown permissions: ${missing.join(', ')}`);
    }
    return found.map((f) => f.id);
  }
}
