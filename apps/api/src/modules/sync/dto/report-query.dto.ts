import { IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  /** yyyy-mm-dd; defaults to today. */
  @IsOptional() @Matches(DAY)
  from?: string;

  /** yyyy-mm-dd; defaults to today. */
  @IsOptional() @Matches(DAY)
  to?: string;
}
