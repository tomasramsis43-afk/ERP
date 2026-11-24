import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
  roles: { select: { role: { select: { code: true, nameAr: true, nameEn: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(page: number, pageSize: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateUserDto, actorId: string) {
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
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: PUBLIC_SELECT,
    });
    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      newData: { email, roles: dto.roleCodes },
    });
    return user;
  }

  async setActive(id: string, isActive: boolean, reason: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
    if (!existing) throw new NotFoundException('User not found');
    const user = await this.prisma.user.update({ where: { id }, data: { isActive }, select: PUBLIC_SELECT });
    await this.audit.record({
      userId: actorId,
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
