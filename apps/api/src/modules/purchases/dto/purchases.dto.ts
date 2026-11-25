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
import { PaymentKindDto } from '../../sales/dto/sales.dto';

const QTY = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/;
const PRICE = /^\d{1,14}(\.\d{1,4})?$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class PurchaseLineDto {
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

export class CreatePurchaseInvoiceDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsISO8601({ strict: true })
  invoiceDate!: string;

  @IsUUID()
  supplierId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsEnum(PaymentKindDto)
  paymentKind!: PaymentKindDto;

  /** Freight/handling paid to a carrier (in cash); added to the landed cost of the goods. */
  @IsOptional() @Matches(MONEY)
  shippingCost?: string;

  @IsOptional() @IsString() @MaxLength(100)
  supplierRef?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}
