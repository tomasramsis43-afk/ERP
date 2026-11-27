import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AccountingModule, CatalogModule, InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchaseOrdersService],
})
export class PurchasesModule {}
