import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import { GenerationsRepository } from './generations.repository';

@Module({
  imports: [DatabaseModule],
  providers: [PipelinePresetsRepository, GenerationsRepository],
  exports: [PipelinePresetsRepository, GenerationsRepository],
})
export class GenerationsDataModule {}
