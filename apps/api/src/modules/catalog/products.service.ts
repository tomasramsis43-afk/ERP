import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto, ProductUnitDto, UpdateProductDto } from './dto/catalog.dto';

const INCLUDE = {
  baseUnit: true,
  category: true,
  units: { include: { unit: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(p: PageParams, f: { q?: string; categoryId?: string; active?: string }) {
    const where: Prisma.ProductWhereInput = {
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.active === 'true' ? { isActive: true } : f.active === 'false' ? { isActive: false } : {}),
      ...(f.q
        ? {
            OR: [
              { code: { contains: f.q, mode: 'insensitive' } },
              { barcode: f.q },
              { nameAr: { contains: f.q, mode: 'insensitive' } },
              { nameEn: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: INCLUDE, orderBy: { code: 'asc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto, actorId: string) {
    if (await this.prisma.product.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Product code already exists');
    }
    this.assertUnits(dto.baseUnitId, dto.units);
    this.assertLevels(dto.minLevel ?? '0', dto.reorderLevel ?? '0', dto.maxLevel ?? '0');
    const { units, ...data } = dto;
    try {
      const product = await this.prisma.product.create({
        data: { ...data, units: units ? { create: units } : undefined },
        include: INCLUDE,
      });
      await this.audit.record({
        userId: actorId,
        action: 'CREATE',
        entity: 'Product',
        entityId: product.id,
        newData: { code: product.code },
      });
      return product;
    } catch (e) {
      throw this.mapKnownError(e);
    }
  }

  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const existing = await this.get(id);
    const { units, ...data } = dto;
    if (units) this.assertUnits(existing.baseUnitId, units);
    if (dto.minLevel !== undefined || dto.reorderLevel !== undefined || dto.maxLevel !== undefined) {
      // Validate the resulting combination, so lowering only the maximum cannot slip under an existing reorder level.
      this.assertLevels(
        dto.minLevel ?? existing.minLevel.toString(),
        dto.reorderLevel ?? existing.reorderLevel.toString(),
        dto.maxLevel ?? existing.maxLevel.toString(),
      );
    }
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        if (units) {
          await tx.productUnit.deleteMany({ where: { productId: id } });
          await tx.productUnit.createMany({ data: units.map((u) => ({ ...u, productId: id })) });
        }
        return tx.product.update({ where: { id }, data, include: INCLUDE });
      });
      await this.audit.record({
        userId: actorId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: id,
        oldData: {
          retailPrice: existing.retailPrice.toString(),
          wholesalePrice: existing.wholesalePrice.toString(),
          purchasePrice: existing.purchasePrice.toString(),
          isActive: existing.isActive,
        },
        newData: dto as unknown as Prisma.InputJsonValue,
      });
      return product;
    } catch (e) {
      throw this.mapKnownError(e);
    }
  }

  /** A ceiling (maxLevel > 0) must not sit below the safety stock or the reorder level. 0 means "not set". */
  private assertLevels(min: string, reorder: string, max: string): void {
    const ceiling = dec(max);
    if (ceiling.gt(0) && (ceiling.lt(dec(min)) || ceiling.lt(dec(reorder)))) {
      throw new BadRequestException('maxLevel must be at least minLevel and reorderLevel');
    }
  }

  private assertUnits(baseUnitId: string, units?: ProductUnitDto[]): void {
    if (!units) return;
    const ids = units.map((u) => u.unitId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate unit in product units');
    if (ids.includes(baseUnitId)) throw new BadRequestException('The base unit is implicit (factor 1); do not list it');
  }

  private mapKnownError(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('Duplicate code or barcode');
      if (e.code === 'P2003') return new BadRequestException('Referenced unit or category does not exist');
    }
    return e;
  }
}
