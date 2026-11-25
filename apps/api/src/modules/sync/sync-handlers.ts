import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, validate } from 'class-validator';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { CreateSalesInvoiceDto, CreateSalesReturnDto } from '../sales/dto/sales.dto';
import { SalesService } from '../sales/sales.service';
import { VoucherTypeDto } from '../treasury/dto/treasury.dto';
import { VouchersService } from '../treasury/vouchers.service';
import { SyncOpType } from './dto/sync.dto';

export interface RepContext {
  repId: string;
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
    }
  }
}
