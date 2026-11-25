import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartiesModule } from '../parties/parties.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AccountingModule, CatalogModule, InventoryModule, PartiesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
