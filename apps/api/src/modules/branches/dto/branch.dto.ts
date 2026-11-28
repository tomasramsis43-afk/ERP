import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @Matches(/^[A-Za-z0-9._-]{1,30}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  nameEn!: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
