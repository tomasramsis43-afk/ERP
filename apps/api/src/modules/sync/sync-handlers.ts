import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, validate } from 'class-validator';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { LogVisitDto, VisitOutcomeDto } from '../routes/dto/routes.dto';
import { RoutesService } from '../routes/routes.service';
import { CreateSalesInvoiceDto, CreateSalesReturnDto } from '../sales/dto/sales.dto';
import { SalesService } from '../sales/sales.service';
import { VoucherTypeDto } from '../treasury/dto/treasury.dto';
import { ExpenseCategoryDto } from '../vehicles/dto/vehicles.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import { VouchersService } from '../treasury/vouchers.service';
import { SyncOpType } from './dto/sync.dto';

export interface RepContext {
  repId: string;
  repCode: string;
  routeId: string | null;
  vehicleId: string;
  vanWarehouseId: string;
  custodyAccountId: string;
}

class CollectionPayload {
  @IsUUID()
  customerId!: string;

  @Matches(/^\d{1,16}(\.\d{1,2})?$/)
  amount!: string;

  @IsISO8601({ strict: true })
  date!: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

class ExpensePayload {
  @IsEnum(ExpenseCategoryDto)
  category!: ExpenseCategoryDto;

  @IsISO8601({ strict: true })
  date!: string;

  @Matches(/^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,2})?$/)
  amount!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

class VisitPayload {
  @IsUUID()
  customerId!: string;

  @IsEnum(VisitOutcomeDto)
  outcome!: VisitOutcomeDto;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  visitDate?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

class NewCustomerPayload {
  @IsString() @MinLength(1) @MaxLength(200)
  nameAr!: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;
}

async function parse<T extends object>(cls: new () => T, payload: Record<string, unknown>): Promise<T> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    throw new BadRequestException(errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('; '));
  }
  return instance;
}

/**
 * Executes one offline operation through the same services the online API uses.
 * The server, not the device, decides who the representative is and which warehouse and
 * custody account are used, so a modified client cannot sell from another van or collect into another custody.
 * The operation id is the idempotency key of the resulting document.
 */
export class SyncHandlers {
  constructor(
    private readonly sales: SalesService,
    private readonly vouchers: VouchersService,
    private readonly vehicles: VehiclesService,
    private readonly routes: RoutesService,
    private readonly parties: PartiesService,
    private readonly prisma: PrismaService,
  ) {}

  async run(type: SyncOpType, opId: string, payload: Record<string, unknown>, rep: RepContext, user: AuthUser): Promise<string> {
    const key = `sync:${opId}`;
    switch (type) {
      case SyncOpType.SALE: {
        const dto = await parse(CreateSalesInvoiceDto, { ...payload, idempotencyKey: key, warehouseId: rep.vanWarehouseId, representativeId: rep.repId });
        return (await this.sales.createInvoice(dto, user)).id;
      }
      case SyncOpType.RETURN: {
        const dto = await parse(CreateSalesReturnDto, { ...payload, idempotencyKey: key, warehouseId: rep.vanWarehouseId, representativeId: rep.repId });
        return (await this.sales.createReturn(dto, user)).id;
      }
      case SyncOpType.COLLECTION: {
        const p = await parse(CollectionPayload, payload);
        const v = await this.vouchers.create(
          {
            idempotencyKey: key,
            type: VoucherTypeDto.RECEIPT,
            date: p.date,
            amount: p.amount,
            financialAccountId: rep.custodyAccountId,
            partyType: 'CUSTOMER',
            partyId: p.customerId,
            description: p.note ?? 'Field collection',
            representativeId: rep.repId,
          },
          user.id,
        );
        return v.id;
      }
      case SyncOpType.EXPENSE: {
        // Paid from the representative's own custody for the representative's own vehicle; the device cannot choose either.
        const p = await parse(ExpensePayload, payload);
        const v = await this.vehicles.recordExpense(
          rep.vehicleId,
          { idempotencyKey: key, category: p.category, date: p.date, amount: p.amount, financialAccountId: rep.custodyAccountId, description: p.description },
          user.id,
        );
        return v.id;
      }
      case SyncOpType.VISIT: {
        const p = await parse(VisitPayload, payload);
        const dto = Object.assign(new LogVisitDto(), { customerId: p.customerId, outcome: p.outcome, visitDate: p.visitDate, note: p.note, representativeId: rep.repId });
        return (await this.routes.logVisit(dto, user.id)).id;
      }
      case SyncOpType.CUSTOMER: {
        // The code is derived from the operation id, so a replay finds the customer it already created instead of failing.
        const p = await parse(NewCustomerPayload, payload);
        const code = `${rep.repCode}-${opId.replace(/-/g, '').slice(0, 8)}`.slice(0, 30);
        const existing = await this.prisma.customer.findUnique({ where: { code }, select: { id: true } });
        if (existing) return existing.id;
        const c = await this.parties.createCustomer(
          { code, nameAr: p.nameAr.trim(), nameEn: p.nameEn?.trim() || undefined, phone: p.phone?.trim() || undefined, address: p.address?.trim() || undefined, representativeId: rep.repId, routeId: rep.routeId ?? undefined },
          user.id,
        );
        return c.id;
      }
    }
  }
}
