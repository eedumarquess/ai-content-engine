import { Injectable, Logger } from '@nestjs/common';

import { PipelineExecutor } from './pipeline-executor';

@Injectable()
export class GenerationDispatcher {
  private readonly logger = new Logger(GenerationDispatcher.name);

  constructor(private readonly pipelineExecutor: PipelineExecutor) {}

  dispatch(generationId: string): void {
    setImmediate(() => {
      void this.pipelineExecutor.execute(generationId).catch((error: unknown) => {
        this.logger.error(
          `Failed to execute generation ${generationId}.`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    });
  }
}
