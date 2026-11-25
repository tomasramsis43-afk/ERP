import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { RequestLeaveDto } from './dto/hr.dto';

const DAY = 86_400_000;
const DEFAULT_ANNUAL_DAYS = 21;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async entitlement(): Promise<number> {
    const s = await this.prisma.setting.findUnique({ where: { key: 'hr.annualLeaveDays' } });
    return typeof s?.value === 'number' ? s.value : DEFAULT_ANNUAL_DAYS;
  }

  /** Remaining annual-leave days of the year (approved requests only count as used). */
  async balance(employeeId: string, year: number) {
    const used = await this.prisma.leaveRequest.aggregate({
      where: { employeeId, type: 'ANNUAL', status: 'APPROVED', fromDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
      _sum: { days: true },
    });
    const entitled = await this.entitlement();
    const taken = used._sum.days ?? 0;
    return { year, entitled, taken, remaining: entitled - taken };
  }

  async request(dto: RequestLeaveDto, actorId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || !employee.isActive) throw new NotFoundException('Employee not found or inactive');
    const from = toDate(dto.fromDate);
    const to = toDate(dto.toDate);
    if (to < from) throw new BadRequestException('End date is before start date');
    if (from.getUTCFullYear() !== to.getUTCFullYear()) throw new BadRequestException('A request cannot span two years; split it');
    if (from < employee.hireDate) throw new BadRequestException('Leave starts before the hire date');
    const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;

    const overlap = await this.prisma.leaveRequest.count({
      where: { employeeId: dto.employeeId, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: to }, toDate: { gte: from } },
    });
    if (overlap) throw new ConflictException('Overlaps another leave request');
    if (dto.type === 'ANNUAL') {
      const b = await this.balance(dto.employeeId, from.getUTCFullYear());
      if (days > b.remaining) throw new BadRequestException(`Only ${b.remaining} annual leave day(s) remain`);
    }
    const leave = await this.prisma.leaveRequest.create({
      data: { employeeId: dto.employeeId, type: dto.type, fromDate: from, toDate: to, days, reason: dto.reason },
    });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'LeaveRequest', entityId: leave.id, newData: { days, type: dto.type } });
    return leave;
  }

  /** Approving marks each day ON_LEAVE; a day that was ABSENT becomes leave, never both. */
  async decide(id: string, approve: boolean, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const leave = await tx.leaveRequest.findUnique({ where: { id } });
      if (!leave) throw new NotFoundException('Leave request not found');
      if (leave.status !== 'PENDING') throw new ConflictException('Request was already decided');
      if (approve) {
        if (leave.type === 'ANNUAL') {
          const used = await tx.leaveRequest.aggregate({
            where: { employeeId: leave.employeeId, type: 'ANNUAL', status: 'APPROVED', fromDate: { gte: toDate(`${leave.fromDate.getUTCFullYear()}-01-01`), lte: toDate(`${leave.fromDate.getUTCFullYear()}-12-31`) } },
            _sum: { days: true },
          });
          if ((used._sum.days ?? 0) + leave.days > (await this.entitlement())) throw new BadRequestException('Annual leave balance exhausted');
        }
        const closed = await tx.payrollRun.findMany({ select: { period: true } });
        for (let i = 0; i < leave.days; i++) {
          const date = new Date(leave.fromDate.getTime() + i * DAY);
          if (closed.some((c) => c.period === date.toISOString().slice(0, 7))) throw new BadRequestException('Leave touches a month whose payroll is already posted');
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: leave.employeeId, date } },
            create: { employeeId: leave.employeeId, date, status: 'ON_LEAVE', note: `leave ${leave.id.slice(0, 8)}` },
            update: { status: 'ON_LEAVE', note: `leave ${leave.id.slice(0, 8)}` },
          });
        }
      }
      return tx.leaveRequest.update({
        where: { id },
        data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actorId, decidedAt: new Date() },
      });
    });
    await this.audit.record({ userId: actorId, action: approve ? 'APPROVE' : 'REJECT', entity: 'LeaveRequest', entityId: id });
    return result;
  }

  async list(p: PageParams, f: { employeeId?: string; status?: string }) {
    const where = {
      ...(f.employeeId ? { employeeId: f.employeeId } : {}),
      ...(f.status ? { status: f.status as 'PENDING' } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
