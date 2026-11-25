import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, JournalLineInput, dec, roundMoney } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { VoucherTypeDto } from '../treasury/dto/treasury.dto';
import { VouchersService } from '../treasury/vouchers.service';
import { PayPayrollDto } from './dto/hr.dto';
import { absentDaysOf, computePayLine } from './payroll-calc';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly vouchers: VouchersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Runs the month's payroll once: Dr Salaries (net of absence) / Cr Employee Advances (recovered) / Cr Accrued Liabilities (net pay).
   * Repaying advances and posting the journal happen in one transaction with the run itself.
   */
  async run(period: string, actorId: string) {
    const monthStart = toDate(`${period}-01`);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    if (monthStart > toDate(new Date().toISOString())) throw new BadRequestException('Cannot run payroll for a future month');

    let run;
    try {
      run = await this.prisma.$transaction(async (tx) => {
        if (await tx.payrollRun.findUnique({ where: { period } })) throw new ConflictException('Payroll for this month already exists');
        // The unique period index is the real guard against two simultaneous runs.
        const employees = await tx.employee.findMany({ where: { isActive: true, hireDate: { lte: monthEnd } }, orderBy: { code: 'asc' } });
        if (employees.length === 0) throw new BadRequestException('No active employees to pay');

        const created = await tx.payrollRun.create({ data: { period, totalGross: '0', totalDeductions: '0', totalNet: '0', createdById: actorId } });
        let expense = new Decimal(0);
        let advances = new Decimal(0);
        let net = new Decimal(0);
        const lines: Prisma.PayrollLineCreateManyInput[] = [];

        for (const e of employees) {
          const [attendance, unpaid, open] = await Promise.all([
            tx.attendance.count({ where: { employeeId: e.id, status: 'ABSENT', date: { gte: monthStart, lte: monthEnd } } }),
            tx.leaveRequest.findMany({ where: { employeeId: e.id, type: 'UNPAID', status: 'APPROVED', fromDate: { lte: monthEnd }, toDate: { gte: monthStart } } }),
            tx.employeeAdvance.findMany({ where: { employeeId: e.id, status: 'OPEN' }, orderBy: { advanceDate: 'asc' } }),
          ]);
          const absent = absentDaysOf(attendance, unpaid, monthStart, monthEnd);
          const calc = computePayLine({
            baseSalary: e.baseSalary.toString(),
            allowance: e.allowance.toString(),
            absentDays: absent,
            advances: open.map((a) => ({ id: a.id, remaining: dec(a.amount.toString()).minus(a.repaid.toString()).toFixed(2), monthly: a.monthlyDeduction.toString() })),
          });
          for (const r of calc.repayments) {
            const adv = open.find((a) => a.id === r.id)!;
            const repaid = dec(adv.repaid.toString()).plus(r.amount);
            await tx.employeeAdvance.update({
              where: { id: adv.id },
              data: { repaid: repaid.toFixed(2), status: repaid.gte(adv.amount.toString()) ? 'SETTLED' : 'OPEN' },
            });
          }
          expense = expense.plus(calc.expense);
          advances = advances.plus(calc.advanceDeduction);
          net = net.plus(calc.net);
          lines.push({
            runId: created.id,
            employeeId: e.id,
            baseSalary: e.baseSalary.toString(),
            allowance: e.allowance.toString(),
            absentDays: absent,
            absenceDeduction: calc.absenceDeduction.toFixed(2),
            advanceDeduction: calc.advanceDeduction.toFixed(2),
            netPay: calc.net.toFixed(2),
          });
        }
        await tx.payrollLine.createMany({ data: lines });

        const acc = await this.accounts.resolve(['SALARIES_EXPENSE', 'EMPLOYEE_ADVANCES', 'ACCRUED_LIABILITIES'], tx);
        const journalLines: JournalLineInput[] = [{ accountId: acc.SALARIES_EXPENSE, debit: expense, credit: 0 }];
        if (advances.gt(0)) journalLines.push({ accountId: acc.EMPLOYEE_ADVANCES, debit: 0, credit: advances });
        if (net.gt(0)) journalLines.push({ accountId: acc.ACCRUED_LIABILITIES, debit: 0, credit: net });
        const { entry } = await this.posting.post(
          {
            entryDate: monthEnd,
            description: `Payroll ${period}`,
            source: 'PAYROLL',
            sourceId: created.id,
            idempotencyKey: `journal:payroll:${period}`,
            createdById: actorId,
            lines: journalLines,
          },
          tx,
        );
        return tx.payrollRun.update({
          where: { id: created.id },
          data: {
            totalGross: roundMoney(expense).toFixed(2),
            totalDeductions: roundMoney(advances).toFixed(2),
            totalNet: roundMoney(net).toFixed(2),
            journalEntryId: entry.id,
          },
          include: { lines: true },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Payroll for this month already exists');
      throw e;
    }
    await this.audit.record({ userId: actorId, action: 'RUN_PAYROLL', entity: 'PayrollRun', entityId: run.id, newData: { period, net: run.totalNet.toString() } });
    return run;
  }

  /** Pays the month's net salaries in one voucher; a run can be paid once. */
  async pay(id: string, dto: PayPayrollDto, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    const total = dec(run.totalNet.toString());
    if (total.lte(0)) throw new BadRequestException('Nothing to pay');
    const acc = await this.accounts.resolve(['ACCRUED_LIABILITIES']);
    const voucher = await this.vouchers.create(
      {
        idempotencyKey: `payroll-pay:${run.id}`,
        type: VoucherTypeDto.PAYMENT,
        date: dto.date,
        amount: total.toFixed(2),
        financialAccountId: dto.financialAccountId,
        counterAccountId: acc.ACCRUED_LIABILITIES,
        description: `Salaries ${run.period}`,
      },
      actorId,
    );
    const updated = await this.prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', paymentVoucherId: voucher.id } });
    await this.audit.record({ userId: actorId, action: 'PAY_PAYROLL', entity: 'PayrollRun', entityId: id, newData: { voucherId: voucher.id } });
    return updated;
  }

  async list() {
    return this.prisma.payrollRun.findMany({ orderBy: { period: 'desc' } });
  }

  async get(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: { include: { employee: { select: { code: true, nameAr: true, nameEn: true } } } } } });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }
}
