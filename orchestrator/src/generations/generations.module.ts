import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContractsModule } from '../contracts/contracts.module';
import { DatabaseModule } from '../database/database.module';
import { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';

@Module({
  imports: [AuthModule, ContractsModule, DatabaseModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, PipelinePresetsRepository],
})
export class GenerationsModule {}
