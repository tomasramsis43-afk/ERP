import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const QTY = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/;
const PRICE = /^\d{1,14}(\.\d{1,4})?$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export enum PaymentKindDto {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
}

export enum PriceListDto {
  RETAIL = 'RETAIL',
  WHOLESALE = 'WHOLESALE',
}

export enum ReturnConditionDto {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
}

export class SalesLineDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY, { message: 'quantity must be a positive number with up to 4 decimals' })
  quantity!: string;

  @IsOptional() @IsUUID()
  unitId?: string;

  /** Per entered unit. Omit to use the customer price / price list. Overriding needs sales:edit_price. */
  @IsOptional() @Matches(PRICE)
  unitPrice?: string;

  /** Absolute discount for the line. Needs sales:discount. */
  @IsOptional() @Matches(MONEY)
  discount?: string;
}

export class CreateSalesInvoiceDto {
  /** Client-generated UUID. The same value never creates a second invoice (offline replay safe). */
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsISO8601({ strict: true })
  invoiceDate!: string;

  @IsEnum(PaymentKindDto)
  paymentKind!: PaymentKindDto;

  @IsOptional() @IsUUID()
  customerId?: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional() @IsEnum(PriceListDto)
  priceList?: PriceListDto;

  @IsOptional() @IsUUID()
  representativeId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Required when the sale exceeds the customer's credit limit (needs sales:override_credit_limit); recorded in the audit log. */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300)
  creditOverrideReason?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => SalesLineDto)
  lines!: SalesLineDto[];
}

export class CreateSalesReturnDto extends CreateSalesInvoiceDto {
  @IsOptional() @IsUUID()
  originalInvoiceId?: string;

  @IsOptional() @IsEnum(ReturnConditionDto)
  condition?: ReturnConditionDto;
}

export class CancelDocumentDto {
  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}
