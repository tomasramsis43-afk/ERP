import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinancialAccountKindDto } from '../treasury/dto/treasury.dto';
import { FinancialAccountsService } from '../treasury/financial-accounts.service';
import { CreateCommissionRuleDto, CreateRepresentativeDto, UpdateRepresentativeDto } from './dto/representatives.dto';

@Injectable()
export class RepresentativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialAccountsService,
    private readonly audit: AuditService,
  ) {}

  /** Creating a representative also opens their cash custody account under "Custodies" (1401.REP-<code>). */
  async create(dto: CreateRepresentativeDto, actorId: string) {
    if (await this.prisma.representative.findUnique({ where: { code: dto.code } })) throw new ConflictException('Code already exists');
    await this.assertLinks(dto.userId, dto.routeId, dto.vehicleId);

    const rep = await this.prisma.$transaction(async (tx) => {
      const custody = await this.financial.createInTx(
        tx,
        {
          code: `REP-${dto.code}`,
          kind: FinancialAccountKindDto.CASHBOX,
          nameAr: `عهدة المندوب ${dto.nameAr}`,
          nameEn: `Cash custody - ${dto.nameEn ?? dto.code}`,
        },
        actorId,
        { glParentCode: '14', glPrefix: '1401' },
      );
      return tx.representative.create({
        data: {
          code: dto.code,
          nameAr: dto.nameAr,
          nameEn: dto.nameEn,
          phone: dto.phone,
          userId: dto.userId,
          routeId: dto.routeId,
          vehicleId: dto.vehicleId,
          financialAccountId: custody.id,
        },
        include: { financialAccount: true, vehicle: { include: { warehouse: true } } },
      });
    });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Representative', entityId: rep.id, newData: { code: rep.code } });
    return rep;
  }

  async update(id: string, dto: UpdateRepresentativeDto, actorId: string) {
    const existing = await this.prisma.representative.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Representative not found');
    await this.assertLinks(undefined, dto.routeId, dto.vehicleId, id);
    if (dto.isActive === false) {
      const balance = await this.financial.glBalance((await this.prisma.financialAccount.findUniqueOrThrow({ where: { id: existing.financialAccountId } })).glAccountId);
      if (!balance.isZero()) throw new ConflictException('Close the representative\'s day and settle the custody balance before deactivating');
    }
    const rep = await this.prisma.representative.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Representative',
      entityId: id,
      oldData: { routeId: existing.routeId, vehicleId: existing.vehicleId, isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return rep;
  }

  async list(p: PageParams, q?: string) {
    const where: Prisma.RepresentativeWhereInput = q
      ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { nameAr: { contains: q, mode: 'insensitive' } }, { nameEn: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.representative.findMany({
        where,
        include: { route: { select: { code: true, nameAr: true } }, vehicle: { select: { plateNumber: true } }, financialAccount: { select: { glAccountId: true } } },
        orderBy: { code: 'asc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.representative.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (r) => ({ ...r, custodyBalance: (await this.financial.glBalance(r.financialAccount.glAccountId)).toFixed(2) })),
    );
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const rep = await this.prisma.representative.findUnique({
      where: { id },
      include: { route: true, vehicle: { include: { warehouse: true } }, financialAccount: true },
    });
    if (!rep) throw new NotFoundException('Representative not found');
    const custodyBalance = (await this.financial.glBalance(rep.financialAccount.glAccountId)).toFixed(2);
    const stock = rep.vehicle
      ? await this.prisma.stockBalance.findMany({
          where: { warehouseId: rep.vehicle.warehouseId, quantity: { gt: 0 } },
          include: { product: { select: { code: true, nameAr: true, nameEn: true } } },
        })
      : [];
    return { ...rep, custodyBalance, vehicleStock: stock };
  }

  /** The representative record of the logged-in mobile user. */
  async forUser(userId: string) {
    const rep = await this.prisma.representative.findUnique({ where: { userId }, select: { id: true } });
    if (!rep) throw new NotFoundException('No representative profile is linked to this user');
    return this.get(rep.id);
  }

  // ---- commission rules -------------------------------------------------

  listRules() {
    return this.prisma.commissionRule.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  async createRule(dto: CreateCommissionRuleDto, actorId: string) {
    if (dto.basis === 'COLLECTIONS' && dto.productId) throw new BadRequestException('Collection commissions cannot depend on a product');
    if (Number(dto.ratePercent) > 100) throw new BadRequestException('Rate cannot exceed 100%');
    if (dto.representativeId && !(await this.prisma.representative.findUnique({ where: { id: dto.representativeId }, select: { id: true } }))) {
      throw new BadRequestException('Representative not found');
    }
    const rule = await this.prisma.commissionRule.create({ data: dto });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'CommissionRule', entityId: rule.id, newData: dto as unknown as Prisma.InputJsonValue });
    return rule;
  }

  /** Rules are retired, never edited, so past commissions can always be explained. */
  async deactivateRule(id: string, actorId: string) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');
    const updated = await this.prisma.commissionRule.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({ userId: actorId, action: 'DEACTIVATE', entity: 'CommissionRule', entityId: id });
    return updated;
  }

  private async assertLinks(userId?: string, routeId?: string, vehicleId?: string, selfId?: string): Promise<void> {
    if (userId) {
      if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new BadRequestException('User not found');
      if (await this.prisma.representative.findUnique({ where: { userId } })) throw new ConflictException('User is already linked to a representative');
    }
    if (routeId && !(await this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } }))) throw new BadRequestException('Route not found');
    if (vehicleId) {
      if (!(await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }))) throw new BadRequestException('Vehicle not found');
      const taken = await this.prisma.representative.findUnique({ where: { vehicleId } });
      if (taken && taken.id !== selfId) throw new ConflictException('Vehicle is already assigned to another representative');
    }
  }
}
