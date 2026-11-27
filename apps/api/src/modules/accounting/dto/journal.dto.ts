import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;

export class JournalLineDto {
  @IsUUID()
  accountId!: string;

  @Matches(AMOUNT, { message: 'debit must be a non-negative amount with up to 2 decimals' })
  debit!: string;

  @Matches(AMOUNT, { message: 'credit must be a non-negative amount with up to 2 decimals' })
  credit!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Subledger link for party statements/aging (opening balances, manual adjustments). */
  @IsOptional()
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  partyType?: 'CUSTOMER' | 'SUPPLIER';

  @IsOptional()
  @IsUUID()
  partyId?: string;
}

export class CreateJournalDto {
  @IsISO8601({ strict: true })
  entryDate!: string; // YYYY-MM-DD

  @IsString()
  @MinLength(3)
  description!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];

  /** true = post immediately (needs accounting:approve); false = save as draft. */
  @IsOptional()
  @IsBoolean()
  post?: boolean;
}

export class ReverseJournalDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  entryDate?: string;
}

export function toDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
