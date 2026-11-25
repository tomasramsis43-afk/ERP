import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString() @MinLength(2) @MaxLength(30)
  plateNumber!: string;

  @IsString() @MinLength(1) @MaxLength(80)
  model!: string;

  @IsOptional() @IsString() @MaxLength(120)
  driverName?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsISO8601({ strict: true })
  licenseExpiry?: string;

  @IsOptional() @IsISO8601({ strict: true })
  insuranceExpiry?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(80)
  model?: string;

  @IsOptional() @IsString() @MaxLength(120)
  driverName?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsISO8601({ strict: true })
  licenseExpiry?: string;

  @IsOptional() @IsISO8601({ strict: true })
  insuranceExpiry?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export enum ExpenseCategoryDto {
  FUEL = 'FUEL',
  MAINTENANCE = 'MAINTENANCE',
  LICENSE = 'LICENSE',
  INSURANCE = 'INSURANCE',
  OTHER = 'OTHER',
}

export class VehicleExpenseDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsEnum(ExpenseCategoryDto)
  category!: ExpenseCategoryDto;

  @IsISO8601({ strict: true })
  date!: string;

  @Matches(/^(?!0+(\.0+)?$)\d{1,16}(\.\d{1,2})?$/)
  amount!: string;

  /** Cash box the money is paid from. */
  @IsUUID()
  financialAccountId!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}
