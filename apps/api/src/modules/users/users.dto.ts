import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one digit' })
  password!: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];

  /** Defaults to the creator's branch. Leave unset for a system-wide creator. */
  @IsOptional() @IsUUID()
  branchId?: string;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @MinLength(3)
  reason!: string;
}
