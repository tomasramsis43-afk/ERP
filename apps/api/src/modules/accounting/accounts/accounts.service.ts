import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateAccountDto, UpdateAccountDto } from '../dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Flat list ordered by code; clients build the tree from parentId. */
  list(q?: string) {
    const where: Prisma.AccountWhereInput = q
      ? {
          OR: [
            { code: { startsWith: q } },
            { nameAr: { contains: q, mode: 'insensitive' } },
            { nameEn: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    return this.prisma.account.findMany({ where, orderBy: { code: 'asc' }, take: 2000 });
  }

  async create(dto: CreateAccountDto, actorId: string) {
    if (await this.prisma.account.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Account code already exists');
    }
    if (dto.parentId) {
      const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent account not found');
      if (parent.isPostable) throw new BadRequestException('Parent must be a group account (not postable)');
      if (parent.type !== dto.type) throw new BadRequestException('Account type must match its parent');
    }
    const normalBalance = dto.type === 'ASSET' || dto.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
    const account = await this.prisma.account.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        type: dto.type,
        normalBalance,
        parentId: dto.parentId,
        isPostable: dto.isPostable ?? true,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'Account',
      entityId: account.id,
      newData: { code: account.code, type: account.type },
    });
    return account;
  }

  async update(id: string, dto: UpdateAccountDto, actorId: string) {
    const existing = await this.prisma.account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');

    const touchesOpening = dto.openingDebit !== undefined || dto.openingCredit !== undefined;
    if (touchesOpening) {
      if (await this.prisma.journalLine.count({ where: { accountId: id } })) {
        throw new ConflictException('Opening balances cannot change once the account has postings');
      }
      if (dto.openingDebit && dto.openingCredit && Number(dto.openingDebit) > 0 && Number(dto.openingCredit) > 0) {
        throw new BadRequestException('Opening balance must be either debit or credit');
      }
    }
    const updated = await this.prisma.account.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Account',
      entityId: id,
      oldData: {
        nameAr: existing.nameAr,
        nameEn: existing.nameEn,
        isActive: existing.isActive,
        openingDebit: existing.openingDebit.toString(),
        openingCredit: existing.openingCredit.toString(),
      },
      newData: dto as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }
}
