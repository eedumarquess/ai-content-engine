import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';

import { ContractsService } from '../contracts/contracts.service';
import {
  createApiError,
  type ApiErrorResponseDto,
} from '../generations/dto/api-error-response.dto';
import {
  GenerationsRepository,
  type GenerationRecord,
  type GenerationStepRecord,
} from '../generations/generations.repository';
import {
  isPipelinePresetDefinition,
  type PipelinePresetStepDefinition,
} from '../pipeline-presets/pipeline-preset.types';
import { RabbitDlqService } from '../rabbit/rabbit-dlq.service';
import { RabbitRpcClient } from '../rabbit/rabbit-rpc.client';
import {
  isStepRpcReply,
  normalizeWorkerReplyMetadata,
  type PipelineStepName,
  type StepRpcReply,
  type StepRpcRequest,
} from '../rabbit/rabbit.types';

type StepFailureContext = {
  errorJson: ApiErrorResponseDto;
  outputJson: Record<string, unknown> | null;
  replyMetadata: Record<string, unknown>;
};

@Injectable()
export class PipelineExecutor {
  private readonly logger = new Logger(PipelineExecutor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly contractsService: ContractsService,
    private readonly generationsRepository: GenerationsRepository,
    private readonly rabbitRpcClient: RabbitRpcClient,
    private readonly rabbitDlqService: RabbitDlqService,
  ) {}

  async execute(generationId: string): Promise<void> {
    const client = await this.generationsRepository.connect();
    let lockAcquired = false;

    try {
      lockAcquired = await this.generationsRepository.tryAcquireGenerationLock(
        client,
        generationId,
      );

      if (!lockAcquired) {
        return;
      }

      const generation = await this.generationsRepository.findGenerationById(
        generationId,
      );

      if (!generation || generation.completed_at !== null) {
        return;
      }

      if (!isPipelinePresetDefinition(generation.pipeline)) {
        await this.failGeneration(client, generation.id, {
          errors: [
            createApiError(
              'internal_error',
              'Stored pipeline definition is invalid.',
              'pipeline',
            ),
          ],
        });
        return;
      }

      await this.generationsRepository.markGenerationRunning(client, generation.id);

      for (const stepDefinition of generation.pipeline.steps) {
        const stepRecord = generation.steps.find(
          (step) => step.step_name === stepDefinition.name,
        );

        if (!stepRecord) {
          await this.failGeneration(client, generation.id, {
            errors: [
              createApiError(
                'internal_error',
                `Step ${stepDefinition.name} is missing from generation_steps.`,
                'steps',
              ),
            ],
          });
          return;
        }

        if (stepRecord.status === 'completed') {
          continue;
        }

        const succeeded = await this.executeStep(
          client,
          generation,
          stepDefinition,
          stepRecord,
        );

        if (!succeeded) {
          return;
        }

        const refreshed = await this.generationsRepository.findGenerationById(
          generation.id,
        );

        if (!refreshed) {
          return;
        }

        generation.steps = refreshed.steps;
      }

      const lastStep = getLastCompletedStep(generation);

      if (!lastStep || !isRecord(lastStep.output_json)) {
        await this.failGeneration(client, generation.id, {
          errors: [
            createApiError(
              'internal_error',
              'Generation completed without a final step output.',
            ),
          ],
        });
        return;
      }

      const finalDocument = this.contractsService.ensureGenerationDocument(
        lastStep.output_json,
      );
      await this.generationsRepository.completeGeneration(
        client,
        generation.id,
        finalDocument,
      );
    } finally {
      if (lockAcquired) {
        await this.generationsRepository.releaseGenerationLock(client, generationId);
      }
      client.release();
    }
  }

  private async executeStep(
    client: PoolClient,
    generation: GenerationRecord,
    stepDefinition: PipelinePresetStepDefinition,
    stepRecord: GenerationStepRecord,
  ): Promise<boolean> {
    const maxAttempts = Math.max(stepDefinition.max_retries, 1);
    let previousError: StepFailureContext | null =
      stepRecord.status === 'dlq'
        ? {
            errorJson: toApiErrorResponse(stepRecord.error_json),
            outputJson: isRecord(stepRecord.output_json)
              ? stepRecord.output_json
              : null,
            replyMetadata: isRecord(stepRecord.reply_metadata)
              ? stepRecord.reply_metadata
              : {},
          }
        : null;

    for (
      let attempt = Math.max(stepRecord.attempt_count + 1, 1);
      attempt <= maxAttempts;
      attempt += 1
    ) {
      const inputJson = this.buildStepInput(generation, stepDefinition.name);
      await this.generationsRepository.markStepRunning(client, {
        generationId: generation.id,
        stepName: stepDefinition.name,
        attemptCount: attempt,
        inputJson,
      });

      const correlationId = `${generation.id}:${stepDefinition.name}:attempt_${attempt}`;

      try {
        const reply = await this.rabbitRpcClient.sendRpc(
          stepDefinition.queue,
          this.buildRpcRequest(generation, stepDefinition.name, inputJson),
          {
            correlationId,
            timeoutMs: stepDefinition.timeout_ms,
          },
        );
        const parsedReply = this.parseStepReply(reply);

        if (parsedReply.ok) {
          const outputJson = this.contractsService.ensureGenerationDocument(
            parsedReply.output_json,
          );
          const replyMetadata = this.enrichReplyMetadata(
            parsedReply.reply_metadata,
            correlationId,
            stepDefinition.queue,
            stepDefinition.timeout_ms,
            attempt,
          );

          await this.generationsRepository.markStepCompleted(client, {
            generationId: generation.id,
            stepName: stepDefinition.name,
            outputJson,
            replyMetadata,
          });
          return true;
        }

        previousError = {
          errorJson: parsedReply.error_json,
          outputJson: parsedReply.output_json,
          replyMetadata: this.enrichReplyMetadata(
            parsedReply.reply_metadata,
            correlationId,
            stepDefinition.queue,
            stepDefinition.timeout_ms,
            attempt,
          ),
        };
      } catch (error) {
        previousError = this.normalizeThrownError(
          error,
          correlationId,
          stepDefinition.queue,
          stepDefinition.timeout_ms,
          attempt,
        );
      }

      await this.generationsRepository.markStepFailed(client, {
        generationId: generation.id,
        stepName: stepDefinition.name,
        outputJson: previousError.outputJson,
        errorJson: previousError.errorJson,
        replyMetadata: previousError.replyMetadata,
      });
    }

    if (!previousError) {
      previousError = this.normalizeThrownError(
        new Error('Unknown step failure.'),
        `${generation.id}:${stepDefinition.name}:attempt_${stepRecord.attempt_count}`,
        stepDefinition.queue,
        stepDefinition.timeout_ms,
        stepRecord.attempt_count,
      );
    }

    await this.generationsRepository.markStepDlq(client, {
      generationId: generation.id,
      stepName: stepDefinition.name,
      outputJson: previousError.outputJson,
      errorJson: previousError.errorJson,
      replyMetadata: previousError.replyMetadata,
    });
    await this.rabbitDlqService.publishTerminalFailure({
      generation_id: generation.id,
      user_id: generation.user_id,
      pipeline_preset_id: generation.pipeline_preset_id ?? '',
      step_name: stepDefinition.name,
      queue: stepDefinition.queue,
      attempt_count: getAttemptCount(previousError.replyMetadata),
      correlation_id: String(previousError.replyMetadata.correlation_id ?? ''),
      input_json: this.buildStepInput(generation, stepDefinition.name),
      output_json: previousError.outputJson,
      error_json: previousError.errorJson,
      reply_metadata: previousError.replyMetadata,
      failed_at: new Date().toISOString(),
    });
    await this.failGeneration(client, generation.id, previousError.errorJson);
    return false;
  }

  private buildRpcRequest(
    generation: GenerationRecord,
    stepName: PipelineStepName,
    inputJson: StepRpcRequest['input_json'],
  ): StepRpcRequest {
    return {
      generation_id: generation.id,
      user_id: generation.user_id,
      step_name: stepName,
      input_json: inputJson,
      prompt_version: 'v1',
      config: {
        provider: 'ollama',
        model: this.configService.getOrThrow<string>('OLLAMA_MAIN_MODEL'),
      },
    };
  }

  private buildStepInput(
    generation: GenerationRecord,
    stepName: PipelineStepName,
  ): StepRpcRequest['input_json'] {
    const pipeline = extractPipelineNames(generation.pipeline);

    return {
      request: {
        topic: generation.topic,
        platform: generation.platform,
        format: generation.format,
        persona_id: getPersonaId(generation),
      },
      generation: {
        generation_id: generation.id,
        pipeline_preset_id: generation.pipeline_preset_id ?? '',
        user_id: generation.user_id,
        pipeline,
        schema_version: 'v1',
      },
      document:
        stepName === 'review'
          ? this.getCompletedDocument(generation, 'content')
          : null,
    };
  }

  private getCompletedDocument(
    generation: GenerationRecord,
    stepName: PipelineStepName,
  ): Record<string, unknown> {
    const step = generation.steps.find(
      (candidate) =>
        candidate.step_name === stepName && candidate.status === 'completed',
    );

    if (!step || !isRecord(step.output_json)) {
      throw new Error(
        `Step ${stepName} is missing a completed output for generation ${generation.id}.`,
      );
    }

    return this.contractsService.ensureGenerationDocument(step.output_json);
  }

  private parseStepReply(reply: unknown): StepRpcReply {
    if (!isStepRpcReply(reply)) {
      throw new Error('Worker reply does not match the RPC contract.');
    }

    return reply;
  }

  private enrichReplyMetadata(
    replyMetadata: Record<string, unknown>,
    correlationId: string,
    queue: string,
    timeoutMs: number,
    attemptCount: number,
  ): Record<string, unknown> {
    return {
      ...normalizeWorkerReplyMetadata(replyMetadata),
      correlation_id: correlationId,
      queue,
      timeout_ms: timeoutMs,
      attempt_count: attemptCount,
    };
  }

  private normalizeThrownError(
    error: unknown,
    correlationId: string,
    queue: string,
    timeoutMs: number,
    attemptCount: number,
  ): StepFailureContext {
    const isTimeout =
      error instanceof Error && error.message.includes('RPC timeout');
    const message =
      error instanceof Error ? error.message : 'Step execution failed.';

    return {
      errorJson: {
        errors: [
          createApiError(
            isTimeout ? 'step_timeout' : 'step_failed',
            message,
          ),
        ],
      },
      outputJson: null,
      replyMetadata: {
        correlation_id: correlationId,
        queue,
        timeout_ms: timeoutMs,
        attempt_count: attemptCount,
      },
    };
  }

  private async failGeneration(
    client: PoolClient,
    generationId: string,
    errorJson: ApiErrorResponseDto,
  ): Promise<void> {
    await this.generationsRepository.failGeneration(client, generationId, errorJson);
  }
}

function extractPipelineNames(pipeline: unknown): PipelineStepName[] {
  if (!isPipelinePresetDefinition(pipeline)) {
    throw new Error('Stored pipeline definition is invalid.');
  }

  return pipeline.steps.map((step) => step.name);
}

function getLastCompletedStep(
  generation: GenerationRecord,
): GenerationStepRecord | null {
  const pipeline = extractPipelineNames(generation.pipeline);

  for (let index = pipeline.length - 1; index >= 0; index -= 1) {
    const step = generation.steps.find(
      (candidate) =>
        candidate.step_name === pipeline[index] &&
        candidate.status === 'completed',
    );

    if (step) {
      return step;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toApiErrorResponse(value: unknown): ApiErrorResponseDto {
  if (
    typeof value === 'object' &&
    value !== null &&
    'errors' in value &&
    Array.isArray((value as { errors?: unknown[] }).errors)
  ) {
    return value as ApiErrorResponseDto;
  }

  return {
    errors: [createApiError('internal_error', 'Unknown step failure.')],
  };
}

function getAttemptCount(replyMetadata: Record<string, unknown>): number {
  const value = replyMetadata.attempt_count;
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

function getPersonaId(generation: GenerationRecord): string | null {
  for (const step of generation.steps) {
    if (
      isRecord(step.input_json) &&
      isRecord(step.input_json.request) &&
      (step.input_json.request.persona_id === null ||
        typeof step.input_json.request.persona_id === 'string')
    ) {
      return step.input_json.request.persona_id;
    }
  }

  return null;
}
