import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { RepresentativesModule } from '../representatives/representatives.module';
import { RoutesModule } from '../routes/routes.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { SalesModule } from '../sales/sales.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { RepReportService } from './rep-report.service';
import { SnapshotService } from './snapshot.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [SalesModule, TreasuryModule, PartiesModule, RepresentativesModule, RoutesModule, VehiclesModule],
  controllers: [SyncController],
  providers: [SyncService, SnapshotService, RepReportService],
})
export class SyncModule {}
