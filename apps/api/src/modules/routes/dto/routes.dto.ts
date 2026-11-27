import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export enum GeoLevelDto {
  CITY = 'CITY',
  REGION = 'REGION',
  DISTRICT = 'DISTRICT',
}

export class CreateGeoAreaDto {
  @IsEnum(GeoLevelDto)
  level!: GeoLevelDto;

  /** Required for REGION (parent CITY) and DISTRICT (parent REGION); forbidden for CITY. */
  @IsOptional() @IsUUID()
  parentId?: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameEn!: string;
}

export class CreateRouteDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameEn!: string;

  @IsOptional() @IsUUID()
  geoAreaId?: string;
}

export class UpdateRouteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsUUID()
  geoAreaId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export enum VisitOutcomeDto {
  SALE = 'SALE',
  COLLECTION = 'COLLECTION',
  NO_ORDER = 'NO_ORDER',
  SHOP_CLOSED = 'SHOP_CLOSED',
  NOT_REACHED = 'NOT_REACHED',
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class LogVisitDto {
  @IsUUID()
  customerId!: string;

  /** Defaults to the caller's own representative profile, then to the customer's representative. */
  @IsOptional() @IsUUID()
  representativeId?: string;

  /** YYYY-MM-DD; defaults to today. Future days are refused. */
  @IsOptional() @Matches(DAY)
  visitDate?: string;

  @IsEnum(VisitOutcomeDto)
  outcome!: VisitOutcomeDto;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class VisitQueryDto {
  @IsOptional() @Matches(DAY)
  from?: string;

  @IsOptional() @Matches(DAY)
  to?: string;

  @IsOptional() @IsUUID()
  routeId?: string;

  @IsOptional() @IsUUID()
  representativeId?: string;

  @IsOptional() @IsUUID()
  customerId?: string;
}

export class CoverageQueryDto {
  /** YYYY-MM-DD; defaults to today. */
  @IsOptional() @Matches(DAY)
  date?: string;
}

export class SetSequenceDto {
  /** Customers of the route in visiting order; position in the array becomes the sequence number. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsUUID('all', { each: true })
  customerIds!: string[];
}
