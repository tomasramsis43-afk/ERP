import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { RepresentativesModule } from '../representatives/representatives.module';
import { SalesModule } from '../sales/sales.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { SnapshotService } from './snapshot.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [SalesModule, TreasuryModule, PartiesModule, RepresentativesModule],
  controllers: [SyncController],
  providers: [SyncService, SnapshotService],
})
export class SyncModule {}
