import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDefined, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { AdminService, SettingInput } from './admin.service';

class SettingsBody {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SettingItem)
  settings!: SettingItem[];
}

class SettingItem {
  @Matches(/^[A-Za-z0-9._-]{1,80}$/)
  key!: string;

  @IsDefined()
  value!: unknown;
}

class CreatePeriodBody {
  @IsString() @MinLength(3) @MaxLength(60)
  name!: string;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;
}

class UpdatePeriodBody {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(60)
  name?: string;

  @IsOptional() @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}

class RoleBody {
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/)
  code!: string;

  @IsString() @MinLength(2) @MaxLength(60)
  nameAr!: string;

  @IsString() @MinLength(2) @MaxLength(60)
  nameEn!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(300) @IsString({ each: true })
  permissionCodes?: string[];
}

class UpdateRoleBody {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  nameAr?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  nameEn?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(300) @IsString({ each: true })
  permissionCodes?: string[];
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ---- settings --------------------------------------------------------

  @Get('settings')
  @RequirePermissions('settings:view')
  settings() {
    return this.admin.listSettings();
  }

  @Put('settings')
  @RequirePermissions('settings:update')
  saveSettings(@Body() body: SettingsBody, @CurrentUser() u: AuthUser) {
    return this.admin.updateSettings(body.settings as unknown as SettingInput[], u.id);
  }

  // ---- fiscal periods --------------------------------------------------

  @Get('fiscal-periods')
  @RequirePermissions('accounting:view')
  periods() {
    return this.admin.listPeriods();
  }

  @Post('fiscal-periods')
  @RequirePermissions('accounting:create')
  createPeriod(@Body() body: CreatePeriodBody, @CurrentUser() u: AuthUser) {
    return this.admin.createPeriod(body, u.id);
  }

  @Patch('fiscal-periods/:id')
  @RequirePermissions('accounting:approve')
  updatePeriod(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePeriodBody, @CurrentUser() u: AuthUser) {
    return this.admin.updatePeriod(id, body, u.id);
  }

  // ---- roles & permissions ---------------------------------------------

  @Get('permissions')
  @RequirePermissions('roles:view')
  permissions() {
    return this.admin.listPermissions();
  }

  @Get('roles')
  @RequirePermissions('roles:view')
  roles() {
    return this.admin.listRoles();
  }

  @Post('roles')
  @RequirePermissions('roles:create')
  createRole(@Body() body: RoleBody, @CurrentUser() u: AuthUser) {
    return this.admin.createRole(body, u.id);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:update')
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRoleBody, @CurrentUser() u: AuthUser) {
    return this.admin.updateRole(id, body, u.id);
  }
}
