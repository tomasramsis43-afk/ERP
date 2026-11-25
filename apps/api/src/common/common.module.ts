import { Global, Module } from '@nestjs/common';
import { VatService } from './utils/vat.service';

@Global()
@Module({ providers: [VatService], exports: [VatService] })
export class CommonModule {}
