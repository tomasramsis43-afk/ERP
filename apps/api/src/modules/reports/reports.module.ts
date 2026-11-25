import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AgingReportService } from './aging-report.service';
import { DashboardService } from './dashboard.service';
import { ReportTablesService } from './report-tables.service';
import { ReportsController } from './reports.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [AccountingModule],
  controllers: [ReportsController],
  providers: [StatementsService, AgingReportService, DashboardService, ReportTablesService],
})
export class ReportsModule {}
