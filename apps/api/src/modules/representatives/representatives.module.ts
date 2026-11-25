import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { ClosingService } from './closing.service';
import { CommissionsService } from './commissions.service';
import { RepresentativesController } from './representatives.controller';
import { RepresentativesService } from './representatives.service';

@Module({
  imports: [AccountingModule, TreasuryModule, InventoryModule],
  controllers: [RepresentativesController],
  providers: [RepresentativesService, ClosingService, CommissionsService],
  exports: [RepresentativesService],
})
export class RepresentativesModule {}
