import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockCountsService } from './stock-counts.service';
import { StockService } from './stock.service';

@Module({
  imports: [AccountingModule, CatalogModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockService, StockCountsService],
  // Sales, purchases and representatives move stock exclusively through StockService.
  exports: [StockService],
})
export class InventoryModule {}
