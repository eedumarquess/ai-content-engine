import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import { GenerationsRepository } from '../generations/generations.repository';
import { GenerationDispatcher } from './generation-dispatcher.service';

@Injectable()
export class PipelineRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PipelineRecoveryService.name);

  constructor(
    private readonly generationsRepository: GenerationsRepository,
    private readonly generationDispatcher: GenerationDispatcher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const generationIds = await this.generationsRepository.findPendingGenerationIds();

    if (generationIds.length === 0) {
      return;
    }

    this.logger.log(
      `Re-dispatching ${generationIds.length} pending generation(s) on startup.`,
    );

    for (const generationId of generationIds) {
      this.generationDispatcher.dispatch(generationId);
    }
  }
}
