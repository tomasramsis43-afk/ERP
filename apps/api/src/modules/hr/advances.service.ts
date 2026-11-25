import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { AuditService } from '../audit/audit.service';
import { VoucherTypeDto } from '../treasury/dto/treasury.dto';
import { VouchersService } from '../treasury/vouchers.service';
import { CreateAdvanceDto } from './dto/hr.dto';

@Injectable()
export class AdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VouchersService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  /** Pays the advance out of a cash box/bank (Dr Employee Advances / Cr cash) and registers it for payroll deduction. */
  async create(dto: CreateAdvanceDto, actorId: string) {
    const prior = await this.prisma.employeeAdvance.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (prior) return prior;
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || !employee.isActive) throw new NotFoundException('Employee not found or inactive');
    const amount = roundMoney(dto.amount);
    const monthly = roundMoney(dto.monthlyDeduction);
    if (amount.lte(0) || monthly.lte(0)) throw new BadRequestException('Amounts must be greater than zero');
    if (monthly.gt(amount)) throw new BadRequestException('Monthly deduction cannot exceed the advance');

    const acc = await this.accounts.resolve(['EMPLOYEE_ADVANCES']);
    const voucher = await this.vouchers.create(
      {
        idempotencyKey: `advance:${dto.idempotencyKey}`,
        type: VoucherTypeDto.PAYMENT,
        date: dto.date,
        amount: amount.toFixed(2),
        financialAccountId: dto.financialAccountId,
        counterAccountId: acc.EMPLOYEE_ADVANCES,
        description: `Advance to ${employee.code}`,
      },
      actorId,
    );
    try {
      const advance = await this.prisma.employeeAdvance.create({
        data: {
          employeeId: employee.id,
          amount: amount.toFixed(2),
          monthlyDeduction: monthly.toFixed(2),
          advanceDate: voucher.voucherDate,
          voucherId: voucher.id,
          idempotencyKey: dto.idempotencyKey,
          note: dto.note,
          createdById: actorId,
        },
      });
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'EmployeeAdvance', entityId: advance.id, newData: { amount: advance.amount.toString() } });
      return advance;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.employeeAdvance.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing) return existing;
      }
      throw e;
    }
  }

  async list(p: PageParams, f: { employeeId?: string; status?: string }) {
    const where = {
      ...(f.employeeId ? { employeeId: f.employeeId } : {}),
      ...(f.status === 'OPEN' || f.status === 'SETTLED' ? { status: f.status } : {}),
    } satisfies Prisma.EmployeeAdvanceWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employeeAdvance.findMany({ where, orderBy: { advanceDate: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.employeeAdvance.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
