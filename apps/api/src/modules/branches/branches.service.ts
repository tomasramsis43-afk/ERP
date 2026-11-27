import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, branchScope } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, pageSize: number, actor: AuthUser) {
    const scope = branchScope(actor);
    const where = scope ? { id: scope } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string, actor: AuthUser) {
    if (branchScope(actor) && branchScope(actor) !== id) throw new NotFoundException('Branch not found');
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { _count: { select: { users: true, warehouses: true } } },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(dto: CreateBranchDto, actor: AuthUser) {
    if (branchScope(actor)) throw new ForbiddenException('Branch-scoped users cannot create branches');
    if (await this.prisma.branch.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Branch code already exists');
    }
    const branch = await this.prisma.branch.create({ data: dto });
    await this.audit.record({ userId: actor.id, action: 'CREATE', entity: 'Branch', entityId: branch.id, newData: { code: branch.code } });
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actor: AuthUser) {
    if (branchScope(actor) && branchScope(actor) !== id) throw new ForbiddenException('Branch-scoped users cannot edit other branches');
    const existing = await this.prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Branch not found');
    if (dto.isActive === false) {
      const activeWarehouses = await this.prisma.warehouse.count({ where: { branchId: id, isActive: true } });
      if (activeWarehouses) throw new ConflictException('Deactivate the branch warehouses first');
    }
    const branch = await this.prisma.branch.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'Branch',
      entityId: id,
      oldData: { nameAr: existing.nameAr, isActive: existing.isActive },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return branch;
  }
}
