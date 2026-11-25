import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { RecordAttendanceDto } from './dto/hr.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** One record per employee per day; recording again corrects the day. */
  async record(dto: RecordAttendanceDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || !employee.isActive) throw new NotFoundException('Employee not found or inactive');
    const date = toDate(dto.date);
    if (date > toDate(new Date().toISOString())) throw new BadRequestException('Cannot record attendance in the future');
    if (date < employee.hireDate) throw new BadRequestException('Date is before the hire date');
    const checkIn = dto.checkIn ? new Date(dto.checkIn) : undefined;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : undefined;
    if (checkIn && checkOut && checkOut < checkIn) throw new BadRequestException('Check-out is before check-in');

    const closed = await this.prisma.payrollRun.findUnique({ where: { period: dto.date.slice(0, 7) } });
    if (closed) throw new BadRequestException('Payroll for this month is already posted; attendance can no longer change');

    const data = { status: dto.status, checkIn, checkOut, note: dto.note };
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      create: { employeeId: dto.employeeId, date, ...data },
      update: data,
    });
  }

  async month(employeeId: string | undefined, period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException('period must be YYYY-MM');
    const from = toDate(`${period}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const rows = await this.prisma.attendance.findMany({
      where: { ...(employeeId ? { employeeId } : {}), date: { gte: from, lte: to } },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
    });
    const summary: Record<string, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 0 };
    for (const r of rows) summary[r.status] += 1;
    return { period, summary, rows };
  }
}
