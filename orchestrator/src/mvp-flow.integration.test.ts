import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigService } from '@nestjs/config';

import type { AuthenticatedUser } from './auth/auth.types';
import { ContractsService } from './contracts/contracts.service';
import { GenerateService } from './generations/generate.service';
import type {
  GenerationRecord,
  GenerationsRepository,
} from './generations/generations.repository';
import { GenerationsQueryService } from './generations/generations-query.service';
import type { StoredPipelinePreset } from './pipeline-presets/pipeline-preset.types';
import { PipelineExecutor } from './pipeline/pipeline-executor';
import { PerformanceEventsService } from './performance-events/performance-events.service';

const AUTHENTICATED_USER: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'local-admin@example.com',
};

const PIPELINE_PRESET: StoredPipelinePreset = {
  id: 'c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1',
  userId: null,
  name: 'content_review_v1',
  steps: {
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
  isActive: true,
  createdAt: new Date('2026-03-05T20:00:00.000Z'),
};

describe('MvpFlowIntegration', () => {
  it('covers ack, pipeline execution, generation query and performance ingestion', async () => {
    const repository = new InMemoryGenerationsRepository();
    const dispatcherCalls: string[] = [];
    const performanceRepository = new FakePerformanceEventsRepository();
    const contractsService = new ContractsService();

    const generateService = new GenerateService(
      contractsService,
      {
        findActivePresetForUser: async () => PIPELINE_PRESET,
      } as never,
      repository as never,
      {
        dispatch: (generationId: string) => {
          dispatcherCalls.push(generationId);
        },
      } as never,
    );

    const ack = await generateService.createGeneration(AUTHENTICATED_USER, {
      topic: 'RAG em producao',
      platform: 'linkedin',
      format: 'thread',
      pipeline_preset_id: PIPELINE_PRESET.id,
    });

    assert.equal(ack.status, 'queued');
    assert.deepEqual(dispatcherCalls, [ack.generation_id]);

    const executor = new PipelineExecutor(
      {
        getOrThrow: (key: string) => {
          if (key === 'OLLAMA_MAIN_MODEL') {
            return 'qwen2.5:7b';
          }
          throw new Error(`Unexpected config key ${key}`);
        },
      } as unknown as ConfigService,
      contractsService,
      repository as never,
      {
        sendRpc: async (_queue: string, payload: { step_name: string; generation_id: string }) =>
          ({
            ok: true,
            output_json: buildGenerationDocument(
              payload.generation_id,
              payload.step_name === 'content' ? 'Hook inicial' : 'Hook revisado',
            ),
            reply_metadata: {
              agent_name: payload.step_name,
              model: 'qwen2.5:7b',
              prompt_version: 'v1',
              tokens_in: payload.step_name === 'content' ? 120 : 80,
              tokens_out: payload.step_name === 'content' ? 180 : 140,
              latency_ms: payload.step_name === 'content' ? 900 : 700,
              cost_usd: 0,
              repair_attempts: payload.step_name === 'content' ? 0 : 1,
              trace_id: `${payload.step_name}-trace`,
            },
          }),
      } as never,
      {
        publishTerminalFailure: async () => {
          throw new Error('DLQ should not be used in the happy path.');
        },
      } as never,
    );

    await executor.execute(ack.generation_id);

    const queryService = new GenerationsQueryService(
      contractsService,
      repository as never,
    );
    const generation = await queryService.getGeneration(
      AUTHENTICATED_USER,
      ack.generation_id,
    );

    assert.equal(generation.status, 'completed');
    assert.equal(generation.result?.post.hook, 'Hook revisado');
    assert.equal(generation.metadata.steps[0]?.trace_id, 'content-trace');
    assert.equal(generation.metadata.steps[1]?.repair_attempts, 1);
    assert.equal(generation.metadata.metrics.total_tokens_in, 200);
    assert.equal(generation.metadata.metrics.total_latency_ms, 1600);
    assert.equal(generation.metadata.metrics.completed_steps, 2);

    const performanceService = new PerformanceEventsService(
      repository as never,
      performanceRepository as never,
    );
    const performanceAck = await performanceService.createEvent(
      AUTHENTICATED_USER,
      {
        generation_id: ack.generation_id,
        platform: 'linkedin',
        post_id: 'post-123',
        metrics: {
          likes: 15,
          comments: 3,
          shares: 2,
          impressions: 540,
          engagement_rate: 0.037,
        },
      },
    );

    assert.equal(performanceAck.status, 'stored');
    assert.equal(performanceRepository.insertCalls.length, 1);
    assert.equal(
      performanceRepository.insertCalls[0]?.generationId,
      ack.generation_id,
    );
  });
});

class InMemoryGenerationsRepository {
  private generation: GenerationRecord | null = null;

  async createGeneration(input: {
    userId: string;
    request: {
      topic: string;
      platform: string;
      format: string;
      pipeline_preset_id: string;
      persona_id?: string | null;
    };
    preset: StoredPipelinePreset;
  }): Promise<string> {
    const generationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    this.generation = {
      id: generationId,
      user_id: input.userId,
      pipeline_preset_id: input.request.pipeline_preset_id,
      topic: input.request.topic,
      platform: input.request.platform,
      format: input.request.format,
      pipeline: input.preset.steps,
      schema_version: 'v1',
      status: 'queued',
      result_json: null,
      error_json: null,
      created_at: '2026-03-05T20:00:00.000Z',
      started_at: null,
      completed_at: null,
      steps: input.preset.steps.steps.map((step, index) => ({
        id: String(index + 1),
        generation_id: generationId,
        step_name: step.name,
        status: 'queued',
        attempt_count: 0,
        input_json: {
          request: {
            topic: input.request.topic,
            platform: input.request.platform,
            format: input.request.format,
            persona_id: input.request.persona_id ?? null,
          },
          generation: {
            generation_id: generationId,
            pipeline_preset_id: input.request.pipeline_preset_id,
            user_id: input.userId,
            pipeline: input.preset.steps.steps.map((candidate) => candidate.name),
            schema_version: 'v1',
          },
          document: null,
        },
        output_json: null,
        error_json: null,
        reply_metadata: {},
        started_at: null,
        finished_at: null,
      })),
    };

    return generationId;
  }

  async findGenerationForUser(
    generationId: string,
    userId: string,
  ): Promise<GenerationRecord | null> {
    if (
      this.generation?.id === generationId &&
      this.generation.user_id === userId
    ) {
      return structuredClone(this.generation);
    }

    return null;
  }

  async findGenerationById(generationId: string): Promise<GenerationRecord | null> {
    if (this.generation?.id === generationId) {
      return structuredClone(this.generation);
    }

    return null;
  }

  async connect() {
    return {
      release: () => undefined,
    } as never;
  }

  async tryAcquireGenerationLock(): Promise<boolean> {
    return true;
  }

  async releaseGenerationLock(): Promise<void> {
    return undefined;
  }

  async markGenerationRunning(): Promise<void> {
    if (this.generation) {
      this.generation.status = 'running';
      this.generation.started_at = this.generation.started_at ?? '2026-03-05T20:00:05.000Z';
    }
  }

  async markStepRunning(
    _client: unknown,
    input: {
      generationId: string;
      stepName: string;
      attemptCount: number;
      inputJson: unknown;
    },
  ): Promise<void> {
    const step = this.getStep(input.generationId, input.stepName);
    if (step) {
      step.status = 'running';
      step.attempt_count = input.attemptCount;
      step.input_json = input.inputJson;
    }
  }

  async markStepCompleted(
    _client: unknown,
    input: {
      generationId: string;
      stepName: string;
      outputJson: unknown;
      replyMetadata: unknown;
    },
  ): Promise<void> {
    const step = this.getStep(input.generationId, input.stepName);
    if (step) {
      step.status = 'completed';
      step.output_json = input.outputJson;
      step.reply_metadata = input.replyMetadata;
    }
  }

  async markStepFailed(): Promise<void> {
    throw new Error('Failure path is not used in this integration test.');
  }

  async markStepDlq(): Promise<void> {
    throw new Error('DLQ path is not used in this integration test.');
  }

  async completeGeneration(
    _client: unknown,
    generationId: string,
    resultJson: unknown,
  ): Promise<void> {
    if (this.generation?.id === generationId) {
      this.generation.status = 'completed';
      this.generation.result_json = resultJson;
      this.generation.completed_at = '2026-03-05T20:00:45.000Z';
    }
  }

  async failGeneration(): Promise<void> {
    throw new Error('Failure path is not used in this integration test.');
  }

  private getStep(generationId: string, stepName: string) {
    if (this.generation?.id !== generationId) {
      return null;
    }

    const step = this.generation.steps.find((candidate) => candidate.step_name === stepName);
    if (!step) {
      return null;
    }

    if (stepName === 'review') {
      step.input_json = {
        ...(step.input_json as Record<string, unknown>),
        document: this.generation.steps.find((candidate) => candidate.step_name === 'content')
          ?.output_json ?? null,
      };
    }

    return step;
  }
}

class FakePerformanceEventsRepository {
  insertCalls: Array<{
    userId: string;
    generationId: string | null;
    platform: string;
    postId: string | null;
    metrics: {
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
      engagement_rate: number;
    };
  }> = [];

  async insert(input: {
    userId: string;
    generationId: string | null;
    platform: string;
    postId: string | null;
    metrics: {
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
      engagement_rate: number;
    };
  }): Promise<string> {
    this.insertCalls.push(input);
    return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  }
}

function buildGenerationDocument(generationId: string, hook: string) {
  return {
    topic: 'RAG em producao',
    strategy: {
      goal: null,
      angle: null,
      audience: null,
    },
    post: {
      hook,
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
      generation_id: generationId,
      schema_version: 'v1',
      persona_id: null,
      performance_context_used: false,
    },
  };
}
