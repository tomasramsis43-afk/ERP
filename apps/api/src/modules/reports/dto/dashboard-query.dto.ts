import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const TREND_DAYS = [7, 14, 30, 90] as const;

export class DashboardQueryDto {
  /** Length of the sales trend in days (default 14). */
  @IsOptional() @Transform(({ value }) => Number(value)) @IsIn(TREND_DAYS as unknown as number[])
  days?: number;

  /** Restrict sales and purchases to one representative. */
  @IsOptional() @IsUUID()
  representativeId?: string;

  /** Restrict sales and purchases to documents of one branch's warehouses. */
  @IsOptional() @IsUUID()
  branchId?: string;
}
