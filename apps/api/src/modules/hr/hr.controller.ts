import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { AdvancesService } from './advances.service';
import { AttendanceService } from './attendance.service';
import {
  CreateAdvanceDto,
  CreateEmployeeDto,
  DecideLeaveDto,
  PayPayrollDto,
  RecordAttendanceDto,
  RequestLeaveDto,
  RunPayrollDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';
import { EmployeesService } from './employees.service';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class HrController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
    private readonly advances: AdvancesService,
    private readonly payroll: PayrollService,
  ) {}

  // ---- employees ----
  @Get('employees')
  @RequirePermissions('hr:view')
  listEmployees(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.employees.list(parsePage(page, pageSize), q?.trim() || undefined);
  }

  @Get('employees/:id')
  @RequirePermissions('hr:view')
  getEmployee(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Post('employees')
  @RequirePermissions('hr:create')
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() u: AuthUser) {
    return this.employees.create(dto, u.id);
  }

  @Patch('employees/:id')
  @RequirePermissions('hr:update')
  updateEmployee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() u: AuthUser) {
    return this.employees.update(id, dto, u.id);
  }

  // ---- attendance ----
  @Post('attendance')
  @RequirePermissions('hr:update')
  record(@Body() dto: RecordAttendanceDto) {
    return this.attendance.record(dto);
  }

  @Get('attendance')
  @RequirePermissions('hr:view')
  month(@Query('period') period: string, @Query('employeeId') employeeId?: string) {
    return this.attendance.month(employeeId, period);
  }

  // ---- leave ----
  @Get('leaves')
  @RequirePermissions('hr:view')
  leaves(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.leave.list(parsePage(page, pageSize), { employeeId, status });
  }

  @Get('employees/:id/leave-balance')
  @RequirePermissions('hr:view')
  balance(@Param('id', ParseUUIDPipe) id: string, @Query('year') year?: string) {
    return this.leave.balance(id, Number(year) || new Date().getUTCFullYear());
  }

  @Post('leaves')
  @RequirePermissions('hr:create')
  requestLeave(@Body() dto: RequestLeaveDto, @CurrentUser() u: AuthUser) {
    return this.leave.request(dto, u.id);
  }

  @Post('leaves/:id/decide')
  @RequirePermissions('hr:approve')
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideLeaveDto, @CurrentUser() u: AuthUser) {
    return this.leave.decide(id, dto.approve, u.id);
  }

  // ---- advances ----
  @Get('advances')
  @RequirePermissions('hr:view')
  listAdvances(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.advances.list(parsePage(page, pageSize), { employeeId, status });
  }

  @Post('advances')
  @RequirePermissions('hr:approve', 'treasury:create')
  createAdvance(@Body() dto: CreateAdvanceDto, @CurrentUser() u: AuthUser) {
    return this.advances.create(dto, u.id);
  }

  // ---- payroll ----
  @Get('payroll')
  @RequirePermissions('hr:view')
  runs() {
    return this.payroll.list();
  }

  @Get('payroll/:id')
  @RequirePermissions('hr:view')
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.get(id);
  }

  @Post('payroll')
  @RequirePermissions('hr:approve', 'accounting:create')
  runPayroll(@Body() dto: RunPayrollDto, @CurrentUser() u: AuthUser) {
    return this.payroll.run(dto.period, u.id);
  }

  @Post('payroll/:id/pay')
  @RequirePermissions('hr:approve', 'treasury:create')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto, @CurrentUser() u: AuthUser) {
    return this.payroll.pay(id, dto, u.id);
  }
}
