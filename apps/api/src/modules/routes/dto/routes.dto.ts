import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
