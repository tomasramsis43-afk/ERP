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

const QTY = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/; // strictly positive
const COST = /^\d{1,14}(\.\d{1,4})?$/;

export class StockLineDto {
  @IsUUID()
  productId!: string;

  /** Entered in `unitId` (defaults to the product base unit). */
  @Matches(QTY, { message: 'quantity must be a positive number with up to 4 decimals' })
  quantity!: string;

  @IsOptional() @IsUUID()
  unitId?: string;

  /** Cost per entered unit; required for opening stock. */
  @IsOptional() @Matches(COST)
  unitCost?: string;

  /** Batch/lot number recorded on the inbound cost layer. */
  @IsOptional() @IsString() @MaxLength(60)
  batchNo?: string;

  /** Expiry date (YYYY-MM-DD) recorded on the inbound cost layer. */
  @IsOptional() @IsISO8601({ strict: true })
  expiryDate?: string;
}

class BaseStockOpDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Client-generated key (UUID) so retries and offline replays never apply twice. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => StockLineDto)
  lines!: StockLineDto[];
}

export class TransferDto extends BaseStockOpDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;
}

export class OpeningStockDto extends BaseStockOpDto {
  @IsUUID()
  warehouseId!: string;
}

export enum AdjustmentDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export class AdjustmentDto extends BaseStockOpDto {
  @IsUUID()
  warehouseId!: string;

  @IsEnum(AdjustmentDirection)
  direction!: AdjustmentDirection;

  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}
