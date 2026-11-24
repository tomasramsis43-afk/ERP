import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductsService } from './products.service';
import { UnitConversionService } from './unit-conversion.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, ProductsService, UnitConversionService],
  exports: [UnitConversionService],
})
export class CatalogModule {}
