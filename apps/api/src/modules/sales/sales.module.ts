import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartiesModule } from '../parties/parties.module';
import { SalesOrdersService } from './sales-orders.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AccountingModule, CatalogModule, InventoryModule, PartiesModule],
  controllers: [SalesController],
  providers: [SalesService, SalesOrdersService],
  exports: [SalesService],
})
export class SalesModule {}
