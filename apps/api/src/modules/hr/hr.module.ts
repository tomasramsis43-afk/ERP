import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { AdvancesService } from './advances.service';
import { AttendanceService } from './attendance.service';
import { EmployeesService } from './employees.service';
import { HrController } from './hr.controller';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [AccountingModule, TreasuryModule],
  controllers: [HrController],
  providers: [EmployeesService, AttendanceService, LeaveService, AdvancesService, PayrollService],
})
export class HrModule {}
