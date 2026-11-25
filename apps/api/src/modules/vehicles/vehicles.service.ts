import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { VoucherTypeDto } from '../treasury/dto/treasury.dto';
import { VouchersService } from '../treasury/vouchers.service';
import { CreateVehicleDto, UpdateVehicleDto, VehicleExpenseDto } from './dto/vehicles.dto';

/** Expense category -> GL account code (override with settings `accounts.<KEY>` is not needed: these are expense leaves). */
const EXPENSE_ACCOUNT: Record<string, string> = {
  FUEL: '54',
  MAINTENANCE: '55',
  LICENSE: '57',
  INSURANCE: '57',
  OTHER: '57',
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VouchersService,
    private readonly audit: AuditService,
  ) {}

  /** Creating a vehicle also creates its own stock location (a VEHICLE warehouse). */
  async create(dto: CreateVehicleDto, actorId: string) {
    const plate = dto.plateNumber.trim().toUpperCase();
    if (await this.prisma.vehicle.findUnique({ where: { plateNumber: plate } })) throw new ConflictException('Plate number already exists');
    if (dto.routeId && !(await this.prisma.route.findUnique({ where: { id: dto.routeId }, select: { id: true } }))) {
      throw new BadRequestException('Route not found');
    }
    const code = `VAN-${plate.replace(/[^A-Z0-9]/g, '')}`.slice(0, 20);
    const vehicle = await this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: { code, nameAr: `سيارة ${plate}`, nameEn: `Vehicle ${plate}`, type: 'VEHICLE' },
      });
      return tx.vehicle.create({
        data: {
          plateNumber: plate,
          model: dto.model,
          driverName: dto.driverName,
          routeId: dto.routeId,
          licenseExpiry: dto.licenseExpiry ? toDate(dto.licenseExpiry) : undefined,
          insuranceExpiry: dto.insuranceExpiry ? toDate(dto.insuranceExpiry) : undefined,
          warehouseId: warehouse.id,
        },
        include: { warehouse: true },
      });
    });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Vehicle', entityId: vehicle.id, newData: { plate } });
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto, actorId: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vehicle not found');
    if (dto.isActive === false) {
      const stocked = await this.prisma.stockBalance.count({ where: { warehouseId: existing.warehouseId, quantity: { gt: 0 } } });
      if (stocked) throw new ConflictException('Unload the vehicle before deactivating it');
      const rep = await this.prisma.representative.count({ where: { vehicleId: id, isActive: true } });
      if (rep) throw new ConflictException('Reassign the active representative first');
    }
    const { licenseExpiry, insuranceExpiry, ...rest } = dto;
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        ...rest,
        ...(licenseExpiry ? { licenseExpiry: toDate(licenseExpiry) } : {}),
        ...(insuranceExpiry ? { insuranceExpiry: toDate(insuranceExpiry) } : {}),
      },
    });
    await this.audit.record({ userId: actorId, action: 'UPDATE', entity: 'Vehicle', entityId: id, newData: dto as unknown as Prisma.InputJsonValue });
    return vehicle;
  }

  async list(p: PageParams, expiringInDays?: number) {
    const where: Prisma.VehicleWhereInput = {};
    if (expiringInDays !== undefined) {
      const limit = new Date(Date.now() + expiringInDays * 86_400_000);
      where.OR = [{ licenseExpiry: { lte: limit } }, { insuranceExpiry: { lte: limit } }];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: { route: { select: { code: true, nameAr: true } }, representative: { select: { id: true, code: true, nameAr: true } } },
        orderBy: { plateNumber: 'asc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id }, include: { warehouse: true, route: true, representative: true } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return v;
  }

  /** Operating expense: a payment voucher (cash out + expense journal) tagged with the vehicle. */
  async recordExpense(vehicleId: string, dto: VehicleExpenseDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    const account = await this.prisma.account.findUnique({ where: { code: EXPENSE_ACCOUNT[dto.category] } });
    if (!account) throw new BadRequestException('Expense account is not configured');
    return this.vouchers.create(
      {
        idempotencyKey: dto.idempotencyKey,
        type: VoucherTypeDto.PAYMENT,
        date: dto.date,
        amount: dto.amount,
        financialAccountId: dto.financialAccountId,
        counterAccountId: account.id,
        description: dto.description ?? `${dto.category} - ${vehicle.plateNumber}`,
        vehicleId,
        expenseCategory: dto.category,
      },
      actorId,
    );
  }

  async expenses(vehicleId: string, p: PageParams, f: { category?: string; from?: string; to?: string }) {
    const where: Prisma.VoucherWhereInput = {
      vehicleId,
      status: 'POSTED',
      ...(f.category ? { expenseCategory: f.category } : {}),
      ...(f.from || f.to
        ? { voucherDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total, sum] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({ where, orderBy: { voucherDate: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { items, total, totalAmount: (sum._sum.amount ?? 0).toString(), page: p.page, pageSize: p.pageSize };
  }
}
