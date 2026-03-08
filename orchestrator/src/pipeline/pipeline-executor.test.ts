import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigService } from '@nestjs/config';

import { ContractsService } from '../contracts/contracts.service';
import type {
  GenerationRecord,
  GenerationsRepository,
} from '../generations/generations.repository';
import type { RabbitDlqService } from '../rabbit/rabbit-dlq.service';
import type { RabbitRpcClient } from '../rabbit/rabbit-rpc.client';
import { PipelineExecutor } from './pipeline-executor';

function createGeneration(statuses?: Partial<GenerationRecord['steps'][number]>[]) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: '11111111-1111-4111-8111-111111111111',
    pipeline_preset_id: 'c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1',
    topic: 'RAG em producao',
    platform: 'linkedin',
    format: 'thread',
    pipeline: {
      version: 'v1',
      steps: [
        {
          name: 'content',
          agent: 'content',
          queue: 'content.rpc',
          timeout_ms: 300_000,
          max_retries: 3,
        },
        {
          name: 'review',
          agent: 'review',
          queue: 'review.rpc',
          timeout_ms: 300_000,
          max_retries: 3,
        },
      ],
    },
    schema_version: 'v1',
    status: 'queued',
    result_json: null,
    error_json: null,
    created_at: '2026-03-05T20:00:00.000Z',
    started_at: null,
    completed_at: null,
    steps: [
      {
        id: '1',
        generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        step_name: 'content',
        status: 'queued',
        attempt_count: 0,
        input_json: {},
        output_json: null,
        error_json: null,
        reply_metadata: {},
        started_at: null,
        finished_at: null,
      },
      {
        id: '2',
        generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        step_name: 'review',
        status: 'queued',
        attempt_count: 0,
        input_json: {},
        output_json: null,
        error_json: null,
        reply_metadata: {},
        started_at: null,
        finished_at: null,
      },
    ].map((step, index) => ({ ...step, ...(statuses?.[index] ?? {}) })),
  } satisfies GenerationRecord;
}

describe('PipelineExecutor', () => {
  it('executes content then review and completes the generation', async () => {
    const generation = createGeneration();
    const repositoryCalls: string[] = [];
    const repository = {
      connect: async () =>
        ({
          release: () => undefined,
        }) as never,
      tryAcquireGenerationLock: async () => true,
      releaseGenerationLock: async () => undefined,
      findGenerationById: async () => generation,
      markGenerationRunning: async () => {
        repositoryCalls.push('generation:running');
      },
      markStepRunning: async (_client: unknown, input: { stepName: string }) => {
        repositoryCalls.push(`${input.stepName}:running`);
      },
      markStepCompleted: async (
        _client: unknown,
        input: { stepName: string; outputJson: Record<string, unknown> },
      ) => {
        repositoryCalls.push(`${input.stepName}:completed`);
        const step = generation.steps.find((row) => row.step_name === input.stepName);
        if (step) {
          step.status = 'completed';
          step.output_json = input.outputJson;
        }
      },
      completeGeneration: async () => {
        repositoryCalls.push('generation:completed');
      },
    } as unknown as GenerationsRepository;
    const rpcClient = {
      sendRpc: async (_queue: string, payload: { step_name: string }) => ({
        ok: true,
        output_json: {
          topic: 'RAG em producao',
          strategy: {
            goal: null,
            angle: null,
            audience: null,
          },
          post: {
            hook: `${payload.step_name} Hook`,
            body: 'Body',
            cta: 'CTA',
          },
          media: {
            image_prompt: null,
            carousel: [],
            video_prompt: null,
          },
          metadata: {
            platform: 'linkedin',
            format: 'thread',
            pipeline: ['content', 'review'],
            generation_id: generation.id,
            schema_version: 'v1',
            persona_id: null,
            performance_context_used: null,
          },
        },
        reply_metadata: {
          agent_name: payload.step_name,
        },
      }),
    } as unknown as RabbitRpcClient;
    const dlqService = {
      publishTerminalFailure: async () => {
        throw new Error('not used');
      },
    } as unknown as RabbitDlqService;
    const executor = new PipelineExecutor(
      {
        getOrThrow: (key: string) => {
          if (key === 'OLLAMA_MAIN_MODEL') {
            return 'qwen2.5:7b';
          }
          throw new Error(`Unexpected config key ${key}`);
        },
      } as unknown as ConfigService,
      new ContractsService(),
      repository,
      rpcClient,
      dlqService,
    );

    await executor.execute(generation.id);

    assert.deepEqual(repositoryCalls, [
      'generation:running',
      'content:running',
      'content:completed',
      'review:running',
      'review:completed',
      'generation:completed',
    ]);
  });


  it('attempts a step once even when max_retries is configured as zero', async () => {
    const generation = createGeneration();
    generation.pipeline.steps[0].max_retries = 0;

    let attempts = 0;
    let generationFailed = false;
    const repository = {
      connect: async () =>
        ({
          release: () => undefined,
        }) as never,
      tryAcquireGenerationLock: async () => true,
      releaseGenerationLock: async () => undefined,
      findGenerationById: async () => generation,
      markGenerationRunning: async () => undefined,
      markStepRunning: async () => {
        attempts += 1;
      },
      markStepFailed: async () => undefined,
      markStepDlq: async () => undefined,
      failGeneration: async () => {
        generationFailed = true;
      },
    } as unknown as GenerationsRepository;
    const rpcClient = {
      sendRpc: async () => {
        throw new Error('RPC timeout after 300000ms.');
      },
    } as unknown as RabbitRpcClient;
    const dlqService = {
      publishTerminalFailure: async () => undefined,
    } as unknown as RabbitDlqService;
    const executor = new PipelineExecutor(
      {
        getOrThrow: (key: string) => {
          if (key === 'OLLAMA_MAIN_MODEL') {
            return 'qwen2.5:7b';
          }
          throw new Error(`Unexpected config key ${key}`);
        },
      } as unknown as ConfigService,
      new ContractsService(),
      repository,
      rpcClient,
      dlqService,
    );

    await executor.execute(generation.id);

    assert.equal(attempts, 1);
    assert.equal(generationFailed, true);
  });

  it('retries a failing step and sends it to DLQ after the third failure', async () => {
    const generation = createGeneration();
    let failedAttempts = 0;
    let dlqPublished = false;
    let generationFailed = false;
    const repository = {
      connect: async () =>
        ({
          release: () => undefined,
        }) as never,
      tryAcquireGenerationLock: async () => true,
      releaseGenerationLock: async () => undefined,
      findGenerationById: async () => generation,
      markGenerationRunning: async () => undefined,
      markStepRunning: async (
        _client: unknown,
        input: { stepName: string; attemptCount: number },
      ) => {
        const step = generation.steps.find((row) => row.step_name === input.stepName);
        if (step) {
          step.attempt_count = input.attemptCount;
          step.status = 'running';
        }
      },
      markStepFailed: async () => {
        failedAttempts += 1;
      },
      markStepDlq: async (
        _client: unknown,
        input: { stepName: string },
      ) => {
        const step = generation.steps.find((row) => row.step_name === input.stepName);
        if (step) {
          step.status = 'dlq';
        }
      },
      failGeneration: async () => {
        generationFailed = true;
      },
    } as unknown as GenerationsRepository;
    const rpcClient = {
      sendRpc: async () => {
        throw new Error('RPC timeout after 300000ms.');
      },
    } as unknown as RabbitRpcClient;
    const dlqService = {
      publishTerminalFailure: async () => {
        dlqPublished = true;
      },
    } as unknown as RabbitDlqService;
    const executor = new PipelineExecutor(
      {
        getOrThrow: (key: string) => {
          if (key === 'OLLAMA_MAIN_MODEL') {
            return 'qwen2.5:7b';
          }
          throw new Error(`Unexpected config key ${key}`);
        },
      } as unknown as ConfigService,
      new ContractsService(),
      repository,
      rpcClient,
      dlqService,
    );

    await executor.execute(generation.id);

    assert.equal(failedAttempts, 3);
    assert.equal(dlqPublished, true);
    assert.equal(generationFailed, true);
  });
});
