import { IsISO8601, IsOptional } from 'class-validator';

export class PullQueryDto {
  /**
   * Cursor for the product catalogue: the `serverTime` of the previous pull. When present only products changed
   * after it are returned (inactive ones included, flagged, so the phone can drop them).
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  productsSince?: string;
}
