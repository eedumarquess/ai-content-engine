import { Injectable, Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { ContractsService } from '../contracts/contracts.service';
import { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import { GenerationDispatcher } from '../pipeline/generation-dispatcher.service';
import { createApiError } from './dto/api-error-response.dto';
import type { GenerateContentAckDto } from './dto/generate-content-ack.dto';
import { GenerationsRepository } from './generations.repository';

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly contractsService: ContractsService,
    private readonly pipelinePresetsRepository: PipelinePresetsRepository,
    private readonly generationsRepository: GenerationsRepository,
    private readonly generationDispatcher: GenerationDispatcher,
  ) {}

  async createGeneration(
    user: AuthenticatedUser,
    payload: unknown,
  ): Promise<GenerateContentAckDto> {
    const request = this.contractsService.parseGenerateContentRequest(payload);
    const preset = await this.pipelinePresetsRepository.findActivePresetForUser(
      request.pipeline_preset_id,
      user.id,
    );

    if (!preset) {
      throw new ApiErrorsHttpException(404, [
        createApiError(
          'pipeline_preset_not_found',
          'Pipeline preset was not found.',
          'pipeline_preset_id',
        ),
      ]);
    }

    try {
      const generationId = await this.generationsRepository.createGeneration({
        userId: user.id,
        request,
        preset,
      });
      this.generationDispatcher.dispatch(generationId);

      return this.contractsService.ensureGenerateContentAck({
        generation_id: generationId,
        status: 'queued',
        status_url: `/generations/${generationId}`,
      });
    } catch (error) {
      if (error instanceof ApiErrorsHttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to create generation.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ApiErrorsHttpException(500, [
        createApiError('internal_error', 'Failed to create generation.'),
      ]);
    }
  }
}
