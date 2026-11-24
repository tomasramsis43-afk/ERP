import { Module } from '@nestjs/common';
import { PartiesController } from './parties.controller';
import { PartiesService } from './parties.service';
import { PartyLedgerService } from './party-ledger.service';

@Module({
  controllers: [PartiesController],
  providers: [PartiesService, PartyLedgerService],
  exports: [PartyLedgerService],
})
export class PartiesModule {}
