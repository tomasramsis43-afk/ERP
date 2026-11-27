import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AgingReportService } from './aging-report.service';
import { DashboardService } from './dashboard.service';
import { InventoryReportsService } from './inventory-reports.service';
import { ProfitabilityService } from './profitability.service';
import { ReportTablesService } from './report-tables.service';
import { ReportsController } from './reports.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [AccountingModule],
  controllers: [ReportsController],
  providers: [StatementsService, AgingReportService, DashboardService, ReportTablesService, ProfitabilityService, InventoryReportsService],
})
export class ReportsModule {}
