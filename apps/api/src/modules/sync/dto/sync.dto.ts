import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum SyncOpType {
  SALE = 'SALE',
  RETURN = 'RETURN',
  COLLECTION = 'COLLECTION',
  EXPENSE = 'EXPENSE',
  VISIT = 'VISIT',
  CUSTOMER = 'CUSTOMER',
}

export class SyncOperationDto {
  /** Client-generated UUID, stable across retries. */
  @IsUUID()
  opId!: string;

  @IsEnum(SyncOpType)
  type!: SyncOpType;

  @IsISO8601()
  clientCreatedAt!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class PushDto {
  @IsString() @MinLength(3) @MaxLength(100)
  deviceId!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}
