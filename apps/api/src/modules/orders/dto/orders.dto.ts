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
  ValidateNested,
} from 'class-validator';
import { PaymentKindDto, PriceListDto } from '../../sales/dto/sales.dto';

const QTY = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/;
const PRICE = /^\d{1,14}(\.\d{1,4})?$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export enum SalesOrderKindDto {
  QUOTE = 'QUOTE',
  ORDER = 'ORDER',
}

export class SalesOrderLineDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY, { message: 'quantity must be a positive number with up to 4 decimals' })
  quantity!: string;

  @IsOptional() @IsUUID()
  unitId?: string;

  /** Per entered unit. Omit to use the customer price / price list. Overriding needs sales:edit_price. */
  @IsOptional() @Matches(PRICE)
  unitPrice?: string;

  /** Absolute line discount. Needs sales:discount. */
  @IsOptional() @Matches(MONEY)
  discount?: string;
}

export class CreateSalesOrderDto {
  @IsEnum(SalesOrderKindDto)
  kind!: SalesOrderKindDto;

  @IsISO8601({ strict: true })
  docDate!: string;

  @IsOptional() @IsISO8601({ strict: true })
  validUntil?: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsEnum(PaymentKindDto)
  paymentKind!: PaymentKindDto;

  @IsOptional() @IsEnum(PriceListDto)
  priceList?: PriceListDto;

  @IsOptional() @IsUUID()
  representativeId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => SalesOrderLineDto)
  lines!: SalesOrderLineDto[];
}

export class PurchaseOrderLineDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY, { message: 'quantity must be a positive number with up to 4 decimals' })
  quantity!: string;

  @IsOptional() @IsUUID()
  unitId?: string;

  /** Per entered unit. */
  @Matches(PRICE)
  unitPrice!: string;
}

export class CreatePurchaseOrderDto {
  @IsISO8601({ strict: true })
  docDate!: string;

  @IsOptional() @IsISO8601({ strict: true })
  expectedDate?: string;

  @IsUUID()
  supplierId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsEnum(PaymentKindDto)
  paymentKind!: PaymentKindDto;

  @IsOptional() @Matches(MONEY)
  shippingCost?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}
