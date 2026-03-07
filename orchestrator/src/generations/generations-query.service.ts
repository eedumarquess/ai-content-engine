import { Injectable, Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { ContractsService } from '../contracts/contracts.service';
import {
  isPipelinePresetDefinition,
  type PipelinePresetDefinition,
} from '../pipeline-presets/pipeline-preset.types';
import {
  createApiError,
  isApiErrorResponseDto,
  type ApiErrorDto,
} from './dto/api-error-response.dto';
import {
  isGenerationStatusDto,
  isGenerationStepStatusDto,
  type GenerationStatusDto,
  type GenerationStepSummaryDto,
  type GetGenerationResponseDto,
  type PipelineStepNameDto,
} from './dto/get-generation-response.dto';
import { GenerationsRepository } from './generations.repository';

@Injectable()
export class GenerationsQueryService {
  private readonly logger = new Logger(GenerationsQueryService.name);

  constructor(
    private readonly contractsService: ContractsService,
    private readonly generationsRepository: GenerationsRepository,
  ) {}

  async getGeneration(
    user: AuthenticatedUser,
    rawGenerationId: unknown,
  ): Promise<GetGenerationResponseDto> {
    const generationId = this.contractsService.assertUuid(rawGenerationId, 'id');

    try {
      const generation = await this.generationsRepository.findGenerationForUser(
        generationId,
        user.id,
      );

      if (!generation) {
        throw new ApiErrorsHttpException(404, [
          createApiError(
            'generation_not_found',
            'Generation was not found.',
            'id',
          ),
        ]);
      }

      return this.buildGenerationResponse(generation, generation.steps);
    } catch (error) {
      if (error instanceof ApiErrorsHttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to fetch generation.',
        error instanceof Error ? error.stack : undefined,
      );
      throw this.createInternalError('Failed to fetch generation.');
    }
  }

  private buildGenerationResponse(
    generation: Awaited<
      ReturnType<GenerationsRepository['findGenerationForUser']>
    > extends infer TResult
      ? Exclude<TResult, null>
      : never,
    stepRows: Exclude<
      Awaited<ReturnType<GenerationsRepository['findGenerationForUser']>>,
      null
    >['steps'],
  ): GetGenerationResponseDto {
    if (generation.pipeline_preset_id === null) {
      throw this.createInternalError(
        'Generation is missing a pipeline_preset_id.',
        'metadata.pipeline_preset_id',
      );
    }

    if (generation.schema_version !== 'v1') {
      throw this.createInternalError(
        'Unsupported schema version.',
        'metadata.schema_version',
      );
    }

    const status = this.parseGenerationStatus(generation.status);
    const pipeline = this.parsePipelineStepNames(generation.pipeline);
    const result =
      status === 'completed'
        ? this.contractsService.ensureGenerationDocument(generation.result_json)
        : null;
    const errors =
      status === 'failed' ? this.extractFailureErrors(generation.error_json) : [];

    return this.contractsService.ensureGetGenerationResponse({
      generation_id: generation.id,
      status,
      result,
      errors,
      metadata: {
        pipeline_preset_id: generation.pipeline_preset_id,
        schema_version: 'v1',
        created_at: this.toIsoString(
          generation.created_at,
          'metadata.created_at',
        ),
        started_at: this.toNullableIsoString(
          generation.started_at,
          'metadata.started_at',
        ),
        completed_at: this.toNullableIsoString(
          generation.completed_at,
          'metadata.completed_at',
        ),
        steps: this.buildStepSummaries(pipeline, stepRows),
      },
    });
  }

  private buildStepSummaries(
    pipeline: PipelineStepNameDto[],
    stepRows: Exclude<
      Awaited<ReturnType<GenerationsRepository['findGenerationForUser']>>,
      null
    >['steps'],
  ): GenerationStepSummaryDto[] {
    const stepMap = new Map(stepRows.map((stepRow) => [stepRow.step_name, stepRow]));

    return pipeline.map((stepName) => {
      const stepRow = stepMap.get(stepName);

      if (
        !stepRow ||
        !isGenerationStepStatusDto(stepRow.status) ||
        !Number.isInteger(stepRow.attempt_count) ||
        stepRow.attempt_count < 0
      ) {
        return {
          name: stepName,
          status: 'queued',
          attempt_count: 0,
        };
      }

      return {
        name: stepName,
        status: stepRow.status,
        attempt_count: stepRow.attempt_count,
      };
    });
  }

  private parsePipelineStepNames(value: unknown): PipelineStepNameDto[] {
    if (!isPipelinePresetDefinition(value)) {
      throw this.createInternalError(
        'Stored pipeline definition is invalid.',
        'metadata.steps',
      );
    }

    return value.steps.map((step) => {
      if (step.name === 'content' || step.name === 'review') {
        return step.name;
      }

      throw this.createInternalError(
        'Stored pipeline definition contains an unsupported step.',
        'metadata.steps',
      );
    });
  }

  private parseGenerationStatus(value: string): GenerationStatusDto {
    if (isGenerationStatusDto(value)) {
      return value;
    }

    throw this.createInternalError('Stored generation status is invalid.', 'status');
  }

  private extractFailureErrors(errorJson: unknown): ApiErrorDto[] {
    if (isApiErrorResponseDto(errorJson) && errorJson.errors.length > 0) {
      return errorJson.errors;
    }

    return [
      createApiError(
        'internal_error',
        'Generation failed without a valid structured error payload.',
      ),
    ];
  }

  private toIsoString(value: Date | string, field: string): string {
    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw this.createInternalError('Stored timestamp is invalid.', field);
    }

    return parsed.toISOString();
  }

  private toNullableIsoString(
    value: Date | string | null,
    field: string,
  ): string | null {
    if (value === null) {
      return null;
    }

    return this.toIsoString(value, field);
  }

  private createInternalError(
    message: string,
    field: string | null = null,
  ): ApiErrorsHttpException {
    return new ApiErrorsHttpException(500, [
      createApiError('internal_error', message, field),
    ]);
  }
}
