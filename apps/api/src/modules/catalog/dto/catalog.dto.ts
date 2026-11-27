import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PRICE = /^\d{1,14}(\.\d{1,4})?$/;
export const FACTOR = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/; // strictly positive

export class CreateUnitDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(60)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(60)
  nameEn!: string;
}

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameEn!: string;

  @IsOptional() @IsUUID()
  parentId?: string;
}

export class ProductUnitDto {
  @IsUUID()
  unitId!: string;

  /** Number of BASE units contained in one of this unit. */
  @Matches(FACTOR, { message: 'factor must be a positive number with up to 4 decimals' })
  factor!: string;

  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string;
}

export class CreateProductDto {
  @Matches(/^[A-Za-z0-9._-]{1,40}$/)
  code!: string;

  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameEn!: string;

  @IsOptional() @IsString() @MaxLength(500)
  imageUrl?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsUUID()
  baseUnitId!: string;

  @IsOptional() @Matches(PRICE)
  purchasePrice?: string;

  @IsOptional() @Matches(PRICE)
  retailPrice?: string;

  @IsOptional() @Matches(PRICE)
  wholesalePrice?: string;

  @IsOptional() @Matches(PRICE)
  reorderLevel?: string;

  /** Safety stock (0 = not set). */
  @IsOptional() @Matches(PRICE)
  minLevel?: string;

  /** Stock ceiling (0 = not set). When set it must be at least the minimum and the reorder level. */
  @IsOptional() @Matches(PRICE)
  maxLevel?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(500)
  imageUrl?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @Matches(PRICE)
  purchasePrice?: string;

  @IsOptional() @Matches(PRICE)
  retailPrice?: string;

  @IsOptional() @Matches(PRICE)
  wholesalePrice?: string;

  @IsOptional() @Matches(PRICE)
  reorderLevel?: string;

  @IsOptional() @Matches(PRICE)
  minLevel?: string;

  @IsOptional() @Matches(PRICE)
  maxLevel?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** When provided, replaces the product's additional units. */
  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];
}

export class SetCustomerPriceDto {
  @IsUUID()
  customerId!: string;

  @Matches(PRICE)
  price!: string;
}
