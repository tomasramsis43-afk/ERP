import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEvent {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: Prisma.InputJsonValue | null;
  newData?: Prisma.InputJsonValue | null;
  reason?: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId ?? null,
        oldData: event.oldData ?? Prisma.JsonNull,
        newData: event.newData ?? Prisma.JsonNull,
        reason: event.reason,
        ip: event.ip,
        userAgent: event.userAgent,
        deviceId: event.deviceId,
      },
    });
  }

  async list(params: { page: number; pageSize: number; entity?: string; userId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }
}
