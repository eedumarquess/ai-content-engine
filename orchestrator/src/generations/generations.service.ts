import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { ContractsService } from '../contracts/contracts.service';
import { DatabaseService } from '../database/database.service';
import { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import { isPipelinePresetDefinition } from '../pipeline-presets/pipeline-preset.types';
import {
  createApiError,
  isApiErrorResponseDto,
  type ApiErrorDto,
} from './dto/api-error-response.dto';
import type { GenerateContentAckDto } from './dto/generate-content-ack.dto';
import type { GenerateContentRequestDto } from './dto/generate-content-request.dto';
import {
  isGenerationStatusDto,
  isGenerationStepStatusDto,
  type GenerationStatusDto,
  type GenerationStepSummaryDto,
  type GetGenerationResponseDto,
  type PipelineStepNameDto,
} from './dto/get-generation-response.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

type InsertedGenerationRow = {
  id: string;
  status: 'queued';
};

type GenerationRow = {
  id: string;
  pipeline_preset_id: string | null;
  status: string;
  pipeline: unknown;
  schema_version: string;
  result_json: unknown;
  error_json: unknown;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

type GenerationStepRow = {
  step_name: string;
  status: string;
  attempt_count: number;
};

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly pipelinePresetsRepository: PipelinePresetsRepository,
    private readonly contractsService: ContractsService,
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

    const client = await this.databaseService.connect();

    try {
      await client.query('BEGIN');

      const inserted = await client.query<InsertedGenerationRow>(
        `
          INSERT INTO generations (
            user_id,
            pipeline_preset_id,
            topic,
            platform,
            format,
            pipeline,
            schema_version,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'v1', 'queued')
          RETURNING id, status
        `,
        [
          user.id,
          request.pipeline_preset_id,
          request.topic,
          request.platform,
          request.format,
          preset.steps,
        ],
      );
      const generationId = inserted.rows[0]?.id;

      if (!generationId) {
        throw this.createInternalError('Failed to create generation.');
      }

      for (const step of preset.steps.steps) {
        await client.query(
          `
            INSERT INTO generation_steps (
              generation_id,
              step_name,
              status,
              attempt_count,
              input_json,
              reply_metadata
            )
            VALUES ($1, $2, 'queued', 0, '{}'::jsonb, '{}'::jsonb)
            ON CONFLICT (generation_id, step_name) DO NOTHING
          `,
          [generationId, step.name],
        );
      }

      await client.query('COMMIT');

      return this.contractsService.ensureGenerateContentAck({
        generation_id: generationId,
        status: 'queued',
        status_url: `/generations/${generationId}`,
      });
    } catch (error) {
      await rollbackQuietly(client);

      if (error instanceof ApiErrorsHttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to create generation.',
        error instanceof Error ? error.stack : undefined,
      );
      throw this.createInternalError('Failed to create generation.');
    } finally {
      client.release();
    }
  }

  async getGeneration(
    user: AuthenticatedUser,
    rawGenerationId: unknown,
  ): Promise<GetGenerationResponseDto> {
    const generationId = this.contractsService.assertUuid(rawGenerationId, 'id');

    try {
      const generationResult = await this.databaseService.query<GenerationRow>(
        `
          SELECT
            id,
            pipeline_preset_id,
            status,
            pipeline,
            schema_version,
            result_json,
            error_json,
            created_at,
            started_at,
            completed_at
          FROM generations
          WHERE id = $1
            AND user_id = $2
          LIMIT 1
        `,
        [generationId, user.id],
      );
      const generation = generationResult.rows[0];

      if (!generation) {
        throw new ApiErrorsHttpException(404, [
          createApiError(
            'generation_not_found',
            'Generation was not found.',
            'id',
          ),
        ]);
      }

      const stepResult = await this.databaseService.query<GenerationStepRow>(
        `
          SELECT step_name, status, attempt_count
          FROM generation_steps
          WHERE generation_id = $1
        `,
        [generation.id],
      );

      return this.buildGenerationResponse(generation, stepResult.rows);
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
    generation: GenerationRow,
    stepRows: GenerationStepRow[],
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
    stepRows: GenerationStepRow[],
  ): GenerationStepSummaryDto[] {
    const stepMap = new Map<string, GenerationStepRow>();

    for (const stepRow of stepRows) {
      stepMap.set(stepRow.step_name, stepRow);
    }

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

    return value.steps.map((step) => step.name);
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

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback failures so the original error is preserved.
  }
}
