import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WarehouseType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export class CreateWarehouseDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameEn!: string;

  @IsEnum(WarehouseType)
  type!: WarehouseType;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.warehouse.findMany({ orderBy: { code: 'asc' } });
  }

  async create(dto: CreateWarehouseDto, actorId: string) {
    if (await this.prisma.warehouse.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Warehouse code already exists');
    }
    const w = await this.prisma.warehouse.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Warehouse', entityId: w.id });
    return w;
  }

  async update(id: string, dto: UpdateWarehouseDto, actorId: string) {
    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Warehouse not found');
    if (dto.isActive === false) {
      const stocked = await this.prisma.stockBalance.count({ where: { warehouseId: id, quantity: { gt: 0 } } });
      if (stocked) throw new ConflictException('Cannot deactivate a warehouse that still holds stock');
    }
    const w = await this.prisma.warehouse.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Warehouse',
      entityId: id,
      oldData: { isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return w;
  }
}
