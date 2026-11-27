import { BadRequestException, Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { AgingReportService } from './aging-report.service';
import { DashboardService } from './dashboard.service';
import { InventoryReportsService } from './inventory-reports.service';
import { Lang } from './export-tables';
import { renderPdf, renderXlsx } from './exporters';
import { ProfitabilityService } from './profitability.service';
import { REPORT_NAMES, ReportName, ReportTablesService } from './report-tables.service';
import { StatementsService } from './statements.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly statements: StatementsService,
    private readonly aging: AgingReportService,
    private readonly tables: ReportTablesService,
    private readonly profitability: ProfitabilityService,
    private readonly inventoryReports: InventoryReportsService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('reports:view')
  summary() {
    return this.dashboard.summary();
  }

  @Get('income-statement')
  @RequirePermissions('accounting:view', 'reports:view')
  income(@Query('from') from: string, @Query('to') to: string) {
    this.need(from, to);
    return this.statements.incomeStatement(from, to);
  }

  @Get('balance-sheet')
  @RequirePermissions('accounting:view', 'reports:view')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.statements.balanceSheet(asOf ?? new Date().toISOString().slice(0, 10));
  }

  @Get('cash-flow')
  @RequirePermissions('accounting:view', 'reports:view')
  cashFlow(@Query('from') from: string, @Query('to') to: string) {
    this.need(from, to);
    return this.statements.cashFlow(from, to);
  }

  @Get('aging/:type')
  @RequirePermissions('reports:view')
  agingReport(@Param('type') type: string, @Query('asOf') asOf?: string) {
    if (type !== 'customers' && type !== 'suppliers') throw new BadRequestException('type must be customers or suppliers');
    return this.aging.report(type === 'customers' ? 'CUSTOMER' : 'SUPPLIER', asOf);
  }

  /** Gross profit by product, customer or geographic area, net of returns. */
  @Get('profitability')
  @RequirePermissions('reports:view')
  profitabilityReport(
    @Query('dimension') dimension = 'product',
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (dimension !== 'product' && dimension !== 'customer' && dimension !== 'area') {
      throw new BadRequestException('dimension must be product, customer or area');
    }
    this.need(from, to);
    return this.profitability.report(dimension, from, to);
  }

  /** Stock valuation per warehouse and product, reconciled with the inventory ledger accounts. */
  @Get('inventory/valuation')
  @RequirePermissions('reports:view')
  inventoryValuation(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryReports.valuation(warehouseId);
  }

  @Get('inventory/low-stock')
  @RequirePermissions('reports:view')
  lowStock(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryReports.lowStock(warehouseId);
  }

  /** Products holding more stock than their maxLevel. */
  @Get('inventory/overstock')
  @RequirePermissions('reports:view')
  overstock(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryReports.overstock(warehouseId);
  }

  @Get('inventory/slow-moving')
  @RequirePermissions('reports:view')
  slowMoving(@Query('days') days?: string) {
    return this.inventoryReports.slowMoving(days ? Number(days) : 90);
  }

  /** `format` is xlsx (default) or pdf; `lang` is ar or en. */
  @Get('export/:report')
  @RequirePermissions('accounting:view', 'reports:view')
  async export(
    @Param('report') report: string,
    @Query('format') format = 'xlsx',
    @Query('lang') lang = 'en',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
  ) {
    if (!(REPORT_NAMES as readonly string[]).includes(report)) throw new BadRequestException(`Unknown report; one of ${REPORT_NAMES.join(', ')}`);
    if (format !== 'xlsx' && format !== 'pdf') throw new BadRequestException('format must be xlsx or pdf');
    if (lang !== 'ar' && lang !== 'en') throw new BadRequestException('lang must be ar or en');
    const table = await this.tables.build(report as ReportName, { from, to, asOf, lang: lang as Lang });
    const buffer = format === 'xlsx' ? await renderXlsx(table, lang as Lang) : await renderPdf(table);
    return new StreamableFile(buffer, {
      type: format === 'xlsx' ? XLSX : 'application/pdf',
      disposition: `attachment; filename="${report}.${format}"`,
    });
  }

  private need(from?: string, to?: string): void {
    if (!from || !to) throw new BadRequestException('from and to dates are required');
  }
}
