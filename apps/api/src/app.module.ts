import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './database/prisma.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PartiesModule } from './modules/parties/parties.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { HrModule } from './modules/hr/hr.module';
import { SyncModule } from './modules/sync/sync.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RepresentativesModule } from './modules/representatives/representatives.module';
import { RoutesModule } from './modules/routes/routes.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { SalesModule } from './modules/sales/sales.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { HealthController } from './modules/health/health.controller';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    AuditModule,
    AuthModule,
    UsersModule,
    AccountingModule,
    CatalogModule,
    WarehousesModule,
    InventoryModule,
    PartiesModule,
    SalesModule,
    PurchasesModule,
    OrdersModule,
    TreasuryModule,
    RoutesModule,
    VehiclesModule,
    RepresentativesModule,
    ReportsModule,
    HrModule,
    SyncModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle -> authenticate -> authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
