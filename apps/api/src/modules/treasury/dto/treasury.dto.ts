import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ArrayMinSize,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

const POSITIVE_MONEY = /^(?!0+(\.0+)?$)\d{1,16}(\.\d{1,2})?$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export enum FinancialAccountKindDto {
  CASHBOX = 'CASHBOX',
  BANK = 'BANK',
}

export class CreateFinancialAccountDto {
  @Matches(/^[A-Za-z0-9_-]{1,20}$/)
  code!: string;

  @IsEnum(FinancialAccountKindDto)
  kind!: FinancialAccountKindDto;

  @IsString() @MinLength(1) @MaxLength(120)
  nameAr!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  nameEn!: string;

  @IsOptional() @IsString() @MaxLength(120)
  bankName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  accountNumber?: string;

  /** Posted as Dr this account / Cr Opening Balance Equity. */
  @IsOptional() @Matches(MONEY)
  openingBalance?: string;

  @IsOptional() @IsISO8601({ strict: true })
  openingDate?: string;
}

export enum VoucherTypeDto {
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
  TRANSFER = 'TRANSFER',
}

export class CreateVoucherDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsEnum(VoucherTypeDto)
  type!: VoucherTypeDto;

  @IsISO8601({ strict: true })
  date!: string;

  @Matches(POSITIVE_MONEY, { message: 'amount must be positive with up to 2 decimals' })
  amount!: string;

  /** The cash box / bank account the money goes into (receipt) or out of (payment, transfer source). */
  @IsUUID()
  financialAccountId!: string;

  /** Transfer destination. */
  @IsOptional() @IsUUID()
  toFinancialAccountId?: string;

  @IsOptional() @IsIn(['CUSTOMER', 'SUPPLIER'])
  partyType?: 'CUSTOMER' | 'SUPPLIER';

  @IsOptional() @IsUUID()
  partyId?: string;

  /** For non-party vouchers: the expense / income GL account. */
  @IsOptional() @IsUUID()
  counterAccountId?: string;

  @IsString() @MinLength(3) @MaxLength(300)
  description!: string;

  @IsOptional() @IsUUID()
  representativeId?: string;
}

export class IncomingChequeDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  chequeNumber!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  bankName!: string;

  @IsISO8601({ strict: true })
  receivedDate!: string;

  @IsISO8601({ strict: true })
  dueDate!: string;

  @Matches(POSITIVE_MONEY)
  amount!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class OutgoingChequeDto {
  @IsString() @MinLength(8) @MaxLength(100)
  idempotencyKey!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  chequeNumber!: string;

  @IsISO8601({ strict: true })
  issueDate!: string;

  @IsISO8601({ strict: true })
  dueDate!: string;

  @Matches(POSITIVE_MONEY)
  amount!: string;

  @IsUUID()
  supplierId!: string;

  /** The bank account the cheque is drawn on. */
  @IsUUID()
  financialAccountId!: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class SettleChequeDto {
  @IsISO8601({ strict: true })
  date!: string;

  /** Incoming cheques: the bank account that receives the funds. */
  @IsOptional() @IsUUID()
  financialAccountId?: string;
}

export class BounceChequeDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}

export class CancelVoucherDto {
  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}

export class ReconcileDto {
  @IsISO8601({ strict: true })
  statementDate!: string;

  /** Closing balance shown on the bank's statement. */
  @Matches(/^-?\d{1,16}(\.\d{1,2})?$/)
  statementBalance!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  journalLineIds!: string[];
}
