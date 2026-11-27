import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;

export class RecurringJournalLineDto {
  @IsUUID()
  accountId!: string;

  @Matches(AMOUNT)
  debit!: string;

  @Matches(AMOUNT)
  credit!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class CreateRecurringJournalDto {
  @IsString() @MinLength(2) @MaxLength(60)
  code!: string;

  @IsString() @MinLength(3) @MaxLength(300)
  description!: string;

  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency!: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  /** Used by MONTHLY templates; clamped to 28 to avoid short months. */
  @IsOptional() @IsInt() @Min(1) @Max(28)
  dayOfMonth?: number;

  /** Used by WEEKLY templates: 0 = Sunday ... 6 = Saturday. */
  @IsOptional() @IsInt() @Min(0) @Max(6)
  dayOfWeek?: number;

  @IsISO8601({ strict: true })
  nextRunDate!: string;

  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => RecurringJournalLineDto)
  lines!: RecurringJournalLineDto[];
}
