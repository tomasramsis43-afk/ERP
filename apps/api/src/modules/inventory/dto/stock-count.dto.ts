import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

const QTY0 = /^\d{1,14}(\.\d{1,4})?$/; // zero is a valid physical count

export class CreateStockCountDto {
  @IsUUID()
  warehouseId!: string;

  @IsISO8601({ strict: true })
  countDate!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Limit the count sheet to these products; default is every product with a balance in the warehouse. */
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsUUID('all', { each: true })
  productIds?: string[];
}

export class CountLineDto {
  @IsUUID()
  productId!: string;

  /** Physical quantity in BASE units. */
  @Matches(QTY0, { message: 'countedQty must be a non-negative number with up to 4 decimals' })
  countedQty!: string;
}

export class SetCountsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => CountLineDto)
  lines!: CountLineDto[];
}
