import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class OpeningBalanceLineDto {
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  partyType!: 'CUSTOMER' | 'SUPPLIER';

  @IsUUID()
  partyId!: string;

  /** Positive amount. Customers are debited (they owe us); suppliers are credited (we owe them). */
  @Matches(MONEY, { message: 'amount must be a positive amount with up to 2 decimals' })
  amount!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class CreateOpeningBalancesDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Replaying the same operation posts the balances only once. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => OpeningBalanceLineDto)
  lines!: OpeningBalanceLineDto[];
}
