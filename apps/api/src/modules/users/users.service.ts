import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthUser, branchScope } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './users.dto';

const PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  locale: true,
  lastLoginAt: true,
  createdAt: true,
  branch: { select: { id: true, code: true, nameAr: true, nameEn: true } },
  roles: { select: { role: { select: { code: true, nameAr: true, nameEn: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(page: number, pageSize: number, actor: AuthUser) {
    const where = branchScope(actor) ? { branchId: branchScope(actor) } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    if (dto.branchId && branchScope(actor) && dto.branchId !== branchScope(actor)) {
      throw new ForbiddenException('Cannot create a user in another branch');
    }
    const branchId = branchScope(actor) ?? dto.branchId ?? null;
    if (branchId && !(await this.prisma.branch.findUnique({ where: { id: branchId } }))) {
      throw new NotFoundException('Branch not found');
    }
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email already in use');
    }
    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roleCodes } } });
    if (roles.length !== new Set(dto.roleCodes).size) {
      throw new NotFoundException('One or more roles do not exist');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName,
        passwordHash: await bcrypt.hash(dto.password, 12),
        branchId,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: PUBLIC_SELECT,
    });
    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      newData: { email, roles: dto.roleCodes, branchId },
    });
    return user;
  }

  async setActive(id: string, isActive: boolean, reason: string, actor: AuthUser) {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true, branchId: true } });
    if (!existing || (branchScope(actor) && existing.branchId !== branchScope(actor))) throw new NotFoundException('User not found');
    const user = await this.prisma.user.update({ where: { id }, data: { isActive }, select: PUBLIC_SELECT });
    await this.audit.record({
      userId: actor.id,
      action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
      entity: 'User',
      entityId: id,
      oldData: { isActive: existing.isActive },
      newData: { isActive },
      reason,
    });
    return user;
  }
}
