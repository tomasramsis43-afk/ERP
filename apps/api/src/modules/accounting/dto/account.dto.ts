import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;

export enum AccountTypeDto {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export class CreateAccountDto {
  @IsString()
  @Matches(/^[0-9A-Za-z.-]{1,20}$/)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameAr!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn!: string;

  @IsEnum(AccountTypeDto)
  type!: AccountTypeDto;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** false = header/group account that cannot receive postings. */
  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Matches(AMOUNT)
  openingDebit?: string;

  @IsOptional()
  @Matches(AMOUNT)
  openingCredit?: string;
}
