import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContractsModule } from '../contracts/contracts.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import { GenerationsDataModule } from './generations-data.module';
import { GenerationsController } from './generations.controller';
import { GenerationsQueryService } from './generations-query.service';

@Module({
  imports: [AuthModule, ContractsModule, GenerationsDataModule, PipelineModule],
  controllers: [GenerateController, GenerationsController],
  providers: [GenerateService, GenerationsQueryService],
})
export class GenerationsModule {}
