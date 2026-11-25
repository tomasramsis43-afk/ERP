import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

class PartyBase {
  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsInt() @Min(0) @Max(365)
  paymentTermsDays?: number;
}

export class CreateCustomerDto extends PartyBase {
  @Matches(/^[A-Za-z0-9._-]{1,30}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameAr!: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @Matches(MONEY)
  creditLimit?: string;

  @IsOptional() @IsUUID()
  regionId?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsUUID()
  representativeId?: string;
}

export class UpdateCustomerDto extends PartyBase {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameAr?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @Matches(MONEY)
  creditLimit?: string;

  @IsOptional() @IsUUID()
  regionId?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsUUID()
  representativeId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateSupplierDto extends PartyBase {
  @Matches(/^[A-Za-z0-9._-]{1,30}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameAr!: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;
}

export class UpdateSupplierDto extends PartyBase {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameAr?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
