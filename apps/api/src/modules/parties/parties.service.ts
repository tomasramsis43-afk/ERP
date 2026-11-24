import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto, CreateSupplierDto, UpdateCustomerDto, UpdateSupplierDto } from './dto/party.dto';
import { PartyLedgerService } from './party-ledger.service';

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PartyLedgerService,
    private readonly audit: AuditService,
  ) {}

  // ---- customers ----------------------------------------------------

  async listCustomers(p: PageParams, f: { q?: string; regionId?: string; representativeId?: string }) {
    const where: Prisma.CustomerWhereInput = {
      ...(f.regionId ? { regionId: f.regionId } : {}),
      ...(f.representativeId ? { representativeId: f.representativeId } : {}),
      ...(f.q
        ? {
            OR: [
              { code: { contains: f.q, mode: 'insensitive' } },
              { nameAr: { contains: f.q, mode: 'insensitive' } },
              { nameEn: { contains: f.q, mode: 'insensitive' } },
              { phone: { contains: f.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, orderBy: { code: 'asc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    const balances = await this.ledger.balances('CUSTOMER', rows.map((r) => r.id));
    const items = rows.map((r) => ({ ...r, balance: balances.get(r.id) ?? '0.00' }));
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getCustomer(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return { ...c, balance: (await this.ledger.balance('CUSTOMER', id)).toFixed(2) };
  }

  async createCustomer(dto: CreateCustomerDto, actorId: string) {
    await this.assertUniqueCode('customer', dto.code);
    const c = await this.prisma.customer.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Customer', entityId: c.id, newData: { code: c.code } });
    return c;
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto, actorId: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    const c = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: id,
      oldData: { creditLimit: existing.creditLimit.toString(), isActive: existing.isActive, regionId: existing.regionId, representativeId: existing.representativeId },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return c;
  }

  // ---- suppliers ----------------------------------------------------

  async listSuppliers(p: PageParams, q?: string) {
    const where: Prisma.SupplierWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { nameAr: { contains: q, mode: 'insensitive' } },
            { nameEn: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, orderBy: { code: 'asc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.supplier.count({ where }),
    ]);
    const balances = await this.ledger.balances('SUPPLIER', rows.map((r) => r.id));
    return { items: rows.map((r) => ({ ...r, balance: balances.get(r.id) ?? '0.00' })), total, page: p.page, pageSize: p.pageSize };
  }

  async getSupplier(id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    return { ...s, balance: (await this.ledger.balance('SUPPLIER', id)).toFixed(2) };
  }

  async createSupplier(dto: CreateSupplierDto, actorId: string) {
    await this.assertUniqueCode('supplier', dto.code);
    const s = await this.prisma.supplier.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Supplier', entityId: s.id, newData: { code: s.code } });
    return s;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, actorId: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');
    const s = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Supplier',
      entityId: id,
      oldData: { isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return s;
  }

  private async assertUniqueCode(kind: 'customer' | 'supplier', code: string): Promise<void> {
    const found =
      kind === 'customer'
        ? await this.prisma.customer.findUnique({ where: { code } })
        : await this.prisma.supplier.findUnique({ where: { code } });
    if (found) throw new ConflictException('Code already exists');
  }
}
