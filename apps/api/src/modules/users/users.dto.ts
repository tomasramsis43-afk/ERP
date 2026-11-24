import { IsArray, IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @MinLength(3)
  reason!: string;
}
