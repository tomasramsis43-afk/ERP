import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export class CreateRepresentativeDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsOptional() @IsString() @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  /** The login the representative uses in the mobile app. */
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsUUID()
  vehicleId?: string;
}

export class UpdateRepresentativeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameAr?: string;

  @IsOptional() @IsString() @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsUUID()
  vehicleId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export enum CommissionBasisDto {
  SALES = 'SALES',
  COLLECTIONS = 'COLLECTIONS',
  MARGIN = 'MARGIN',
}

export class CreateCommissionRuleDto {
  @IsEnum(CommissionBasisDto)
  basis!: CommissionBasisDto;

  /** Percent, e.g. "2.5" for 2.5%. */
  @Matches(/^\d{1,3}(\.\d{1,4})?$/)
  ratePercent!: string;

  /** Empty = every representative. */
  @IsOptional() @IsUUID()
  representativeId?: string;

  @IsOptional() @IsUUID()
  productId?: string;

  @IsOptional() @IsUUID()
  customerId?: string;

  @IsOptional() @IsUUID()
  geoAreaId?: string;
}

export class CountLineDto {
  @IsUUID()
  productId!: string;

  /** Physically counted quantity in BASE units. */
  @Matches(/^\d{1,14}(\.\d{1,4})?$/)
  quantity!: string;
}

export class CloseDayDto {
  @IsISO8601({ strict: true })
  date!: string;

  /** Cash the representative hands over. */
  @Matches(/^\d{1,16}(\.\d{1,2})?$/)
  declaredCash!: string;

  @IsArray() @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => CountLineDto)
  counts!: CountLineDto[];
}

export class PayCommissionsDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsISO8601({ strict: true })
  date!: string;

  /** Cash box / bank the commissions are paid from. */
  @IsUUID()
  financialAccountId!: string;
}
