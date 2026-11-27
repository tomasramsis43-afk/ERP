import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { SalesModule } from '../sales/sales.module';
import { PurchaseOrdersController, SalesOrdersController } from './orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [CatalogModule, SalesModule, PurchasesModule],
  controllers: [SalesOrdersController, PurchaseOrdersController],
  providers: [SalesOrdersService, PurchaseOrdersService],
})
export class OrdersModule {}
