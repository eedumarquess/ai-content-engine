import { Module } from '@nestjs/common';

import { ContractsModule } from '../contracts/contracts.module';
import { GenerationsDataModule } from '../generations/generations-data.module';
import { RabbitModule } from '../rabbit/rabbit.module';
import { GenerationDispatcher } from './generation-dispatcher.service';
import { PipelineExecutor } from './pipeline-executor';
import { PipelineRecoveryService } from './pipeline-recovery.service';

@Module({
  imports: [ContractsModule, GenerationsDataModule, RabbitModule],
  providers: [PipelineExecutor, GenerationDispatcher, PipelineRecoveryService],
  exports: [PipelineExecutor, GenerationDispatcher],
})
export class PipelineModule {}
