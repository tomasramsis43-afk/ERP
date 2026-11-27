import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WarehouseType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser, branchScope } from '../../common/decorators/auth.decorators';
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

  /** Defaults to the caller's branch. Omit only for system-wide users. */
  @IsOptional() @IsUUID()
  branchId?: string;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsUUID()
  branchId?: string;
}

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(actor: AuthUser) {
    return this.prisma.warehouse.findMany({
      where: branchScope(actor) ? { branchId: branchScope(actor) } : {},
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: CreateWarehouseDto, actor: AuthUser) {
    if (dto.branchId && branchScope(actor) && dto.branchId !== branchScope(actor)) {
      throw new ForbiddenException('Cannot create a warehouse in another branch');
    }
    const branchId = branchScope(actor) ?? dto.branchId ?? null;
    if (branchId && !(await this.prisma.branch.findUnique({ where: { id: branchId } }))) {
      throw new NotFoundException('Branch not found');
    }
    if (await this.prisma.warehouse.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Warehouse code already exists');
    }
    const w = await this.prisma.warehouse.create({ data: { ...dto, branchId } });
    await this.audit.record({ userId: actor.id, action: 'CREATE', entity: 'Warehouse', entityId: w.id, newData: { code: w.code, branchId } });
    return w;
  }

  async update(id: string, dto: UpdateWarehouseDto, actor: AuthUser) {
    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing || (branchScope(actor) && existing.branchId !== branchScope(actor))) throw new NotFoundException('Warehouse not found');
    if (dto.branchId && branchScope(actor) && dto.branchId !== branchScope(actor)) {
      throw new ForbiddenException('Cannot move a warehouse to another branch');
    }
    if (dto.isActive === false) {
      const stocked = await this.prisma.stockBalance.count({ where: { warehouseId: id, quantity: { gt: 0 } } });
      if (stocked) throw new ConflictException('Cannot deactivate a warehouse that still holds stock');
    }
    const w = await this.prisma.warehouse.update({
      where: { id },
      data: { ...dto, ...(branchScope(actor) ? { branchId: branchScope(actor) } : {}) },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'Warehouse',
      entityId: id,
      oldData: { isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return w;
  }
}
