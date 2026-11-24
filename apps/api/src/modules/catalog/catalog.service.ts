import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCategoryDto, CreateUnitDto, SetCustomerPriceDto } from './dto/catalog.dto';

/** Units, categories and per-customer prices: small lookups grouped together. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, actorId: string) {
    if (await this.prisma.unit.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Unit code already exists');
    }
    const unit = await this.prisma.unit.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Unit', entityId: unit.id });
    return unit;
  }

  listCategories() {
    return this.prisma.productCategory.findMany({ orderBy: { nameEn: 'asc' } });
  }

  async createCategory(dto: CreateCategoryDto, actorId: string) {
    if (dto.parentId && !(await this.prisma.productCategory.findUnique({ where: { id: dto.parentId } }))) {
      throw new NotFoundException('Parent category not found');
    }
    const category = await this.prisma.productCategory.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'ProductCategory', entityId: category.id });
    return category;
  }

  async setCustomerPrice(productId: string, dto: SetCustomerPriceDto, actorId: string) {
    const [product, customer] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
      this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true } }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!customer) throw new BadRequestException('Customer not found');
    const existing = await this.prisma.customerPrice.findUnique({
      where: { customerId_productId: { customerId: dto.customerId, productId } },
    });
    const row = await this.prisma.customerPrice.upsert({
      where: { customerId_productId: { customerId: dto.customerId, productId } },
      update: { price: dto.price },
      create: { customerId: dto.customerId, productId, price: dto.price },
    });
    await this.audit.record({
      userId: actorId,
      action: 'SET_CUSTOMER_PRICE',
      entity: 'CustomerPrice',
      entityId: row.id,
      oldData: existing ? { price: existing.price.toString() } : undefined,
      newData: { price: dto.price, customerId: dto.customerId, productId },
    });
    return row;
  }

  listCustomerPrices(productId: string) {
    return this.prisma.customerPrice.findMany({ where: { productId }, include: { customer: { select: { code: true, nameAr: true } } } });
  }
}
