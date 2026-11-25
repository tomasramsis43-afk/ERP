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

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class CreateEmployeeDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsOptional() @IsString() @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(80)
  jobTitle?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsISO8601({ strict: true })
  hireDate!: string;

  @Matches(MONEY)
  baseSalary!: string;

  @IsOptional() @Matches(MONEY)
  allowance?: string;

  @IsOptional() @IsUUID()
  userId?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nameAr?: string;

  @IsOptional() @IsString() @MaxLength(120)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(80)
  jobTitle?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @Matches(MONEY)
  baseSalary?: string;

  @IsOptional() @Matches(MONEY)
  allowance?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export enum AttendanceStatusDto {
  PRESENT = 'PRESENT',
  LATE = 'LATE',
  ABSENT = 'ABSENT',
  ON_LEAVE = 'ON_LEAVE',
}

export class RecordAttendanceDto {
  @IsUUID()
  employeeId!: string;

  @IsISO8601({ strict: true })
  date!: string;

  @IsEnum(AttendanceStatusDto)
  status!: AttendanceStatusDto;

  @IsOptional() @IsISO8601()
  checkIn?: string;

  @IsOptional() @IsISO8601()
  checkOut?: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export enum LeaveTypeDto {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
}

export class RequestLeaveDto {
  @IsUUID()
  employeeId!: string;

  @IsEnum(LeaveTypeDto)
  type!: LeaveTypeDto;

  @IsISO8601({ strict: true })
  fromDate!: string;

  @IsISO8601({ strict: true })
  toDate!: string;

  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

export class DecideLeaveDto {
  @IsBoolean()
  approve!: boolean;
}

export class CreateAdvanceDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsUUID()
  employeeId!: string;

  @Matches(MONEY)
  amount!: string;

  /** Taken from each payroll until the advance is repaid. */
  @Matches(MONEY)
  monthlyDeduction!: string;

  @IsISO8601({ strict: true })
  date!: string;

  @IsUUID()
  financialAccountId!: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class RunPayrollDto {
  /** "YYYY-MM" */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;
}

export class PayPayrollDto {
  @IsUUID()
  financialAccountId!: string;

  @IsISO8601({ strict: true })
  date!: string;
}
