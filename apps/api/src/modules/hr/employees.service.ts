import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/hr.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateEmployeeDto, actorId: string) {
    if (await this.prisma.employee.findUnique({ where: { code: dto.code } })) throw new ConflictException('Code already exists');
    if (dto.userId) {
      if (!(await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } }))) throw new BadRequestException('User not found');
      if (await this.prisma.employee.findUnique({ where: { userId: dto.userId } })) throw new ConflictException('User is already linked to an employee');
    }
    const e = await this.prisma.employee.create({ data: { ...dto, hireDate: toDate(dto.hireDate) } });
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Employee', entityId: e.id, newData: { code: e.code } });
    return e;
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');
    const e = await this.prisma.employee.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Employee',
      entityId: id,
      oldData: { baseSalary: existing.baseSalary.toString(), allowance: existing.allowance.toString(), isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return e;
  }

  async list(p: PageParams, q?: string) {
    const where: Prisma.EmployeeWhereInput = q
      ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { nameAr: { contains: q, mode: 'insensitive' } }, { nameEn: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, orderBy: { code: 'asc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Employee not found');
    const advances = await this.prisma.employeeAdvance.aggregate({
      where: { employeeId: id, status: 'OPEN' },
      _sum: { amount: true, repaid: true },
    });
    const outstanding = Number(advances._sum.amount ?? 0) - Number(advances._sum.repaid ?? 0);
    return { ...e, outstandingAdvances: outstanding.toFixed(2) };
  }
}
