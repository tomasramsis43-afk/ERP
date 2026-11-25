import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module';
import { ClosingService } from './closing.service';
import { CommissionsService } from './commissions.service';
import { RepresentativesController } from './representatives.controller';
import { RepresentativesService } from './representatives.service';

@Module({
  imports: [TreasuryModule],
  controllers: [RepresentativesController],
  providers: [RepresentativesService, ClosingService, CommissionsService],
  exports: [RepresentativesService],
})
export class RepresentativesModule {}
