import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PoolClient } from 'pg';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ContractsService } from '../contracts/contracts.service';
import type { DatabaseService } from '../database/database.service';
import type { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import type { StoredPipelinePreset } from '../pipeline-presets/pipeline-preset.types';
import { GenerationsService } from './generations.service';

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

describe('GenerationsService', () => {
  it('creates a queued generation and returns the ACK contract', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);

        if (text.includes('RETURNING id, status')) {
          return {
            rows: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                status: 'queued',
              },
            ],
          };
        }

        return { rows: [] };
      },
      release: () => undefined,
    } as unknown as PoolClient;
    const databaseService = {
      connect: async () => client,
    } as unknown as DatabaseService;
    const pipelinePresetsRepository = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const service = new GenerationsService(
      databaseService,
      pipelinePresetsRepository,
      new ContractsService(),
    );

    const response = await service.createGeneration(AUTHENTICATED_USER, {
      topic: 'RAG em producao',
      platform: 'linkedin',
      format: 'thread',
      pipeline_preset_id: PIPELINE_PRESET.id,
    });

    assert.equal(response.status, 'queued');
    assert.equal(
      response.status_url,
      '/generations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    assert.equal(
      queries.filter((query) => query.includes('INSERT INTO generation_steps')).length,
      2,
    );
  });

  it('returns a completed generation with validated result and step metadata', async () => {
    const databaseService = {
      query: async <TResult>(
        text: string,
      ): Promise<{ rows: TResult[] }> => {
        if (text.includes('FROM generations')) {
          return {
            rows: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                pipeline_preset_id: PIPELINE_PRESET.id,
                status: 'completed',
                pipeline: PIPELINE_PRESET.steps,
                schema_version: 'v1',
                result_json: {
                  topic: 'RAG em producao',
                  strategy: {
                    goal: null,
                    angle: null,
                    audience: null,
                  },
                  post: {
                    hook: 'Hook',
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
                    generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    schema_version: 'v1',
                    persona_id: null,
                    performance_context_used: null,
                  },
                },
                error_json: null,
                created_at: '2026-03-05T20:00:00.000Z',
                started_at: '2026-03-05T20:00:05.000Z',
                completed_at: '2026-03-05T20:00:45.000Z',
              } as TResult,
            ],
          };
        }

        return {
          rows: [
            {
              step_name: 'content',
              status: 'completed',
              attempt_count: 1,
            },
            {
              step_name: 'review',
              status: 'completed',
              attempt_count: 1,
            },
          ] as TResult[],
        };
      },
    } as unknown as DatabaseService;
    const pipelinePresetsRepository = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const service = new GenerationsService(
      databaseService,
      pipelinePresetsRepository,
      new ContractsService(),
    );

    const response = await service.getGeneration(
      AUTHENTICATED_USER,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    assert.equal(response.status, 'completed');
    assert.equal(response.errors.length, 0);
    assert.equal(response.metadata.steps.length, 2);
    assert.equal(response.metadata.steps[0]?.status, 'completed');
    assert.equal(response.result?.metadata.schema_version, 'v1');
  });

  it('returns a running generation with null result and empty errors', async () => {
    const databaseService = {
      query: async <TResult>(
        text: string,
      ): Promise<{ rows: TResult[] }> => {
        if (text.includes('FROM generations')) {
          return {
            rows: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                pipeline_preset_id: PIPELINE_PRESET.id,
                status: 'running',
                pipeline: PIPELINE_PRESET.steps,
                schema_version: 'v1',
                result_json: null,
                error_json: null,
                created_at: '2026-03-05T20:00:00.000Z',
                started_at: '2026-03-05T20:00:05.000Z',
                completed_at: null,
              } as TResult,
            ],
          };
        }

        return {
          rows: [
            {
              step_name: 'content',
              status: 'running',
              attempt_count: 1,
            },
            {
              step_name: 'review',
              status: 'queued',
              attempt_count: 0,
            },
          ] as TResult[],
        };
      },
    } as unknown as DatabaseService;
    const pipelinePresetsRepository = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const service = new GenerationsService(
      databaseService,
      pipelinePresetsRepository,
      new ContractsService(),
    );

    const response = await service.getGeneration(
      AUTHENTICATED_USER,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    assert.equal(response.status, 'running');
    assert.equal(response.result, null);
    assert.deepEqual(response.errors, []);
    assert.equal(response.metadata.started_at, '2026-03-05T20:00:05.000Z');
    assert.equal(response.metadata.completed_at, null);
  });

  it('falls back to an internal error when the stored failure payload is invalid', async () => {
    const databaseService = {
      query: async <TResult>(
        text: string,
      ): Promise<{ rows: TResult[] }> => {
        if (text.includes('FROM generations')) {
          return {
            rows: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                pipeline_preset_id: PIPELINE_PRESET.id,
                status: 'failed',
                pipeline: PIPELINE_PRESET.steps,
                schema_version: 'v1',
                result_json: null,
                error_json: {
                  errors: [
                    {
                      code: 'step_failed',
                      message: 'Agent failed without normalized metadata.',
                    },
                  ],
                },
                created_at: '2026-03-05T20:00:00.000Z',
                started_at: '2026-03-05T20:00:05.000Z',
                completed_at: '2026-03-05T20:00:45.000Z',
              } as TResult,
            ],
          };
        }

        return {
          rows: [
            {
              step_name: 'content',
              status: 'failed',
              attempt_count: 3,
            },
            {
              step_name: 'review',
              status: 'dlq',
              attempt_count: 0,
            },
          ] as TResult[],
        };
      },
    } as unknown as DatabaseService;
    const pipelinePresetsRepository = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const service = new GenerationsService(
      databaseService,
      pipelinePresetsRepository,
      new ContractsService(),
    );

    const response = await service.getGeneration(
      AUTHENTICATED_USER,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    assert.equal(response.status, 'failed');
    assert.equal(response.result, null);
    assert.deepEqual(response.errors, [
      {
        code: 'internal_error',
        message: 'Generation failed without a valid structured error payload.',
        field: null,
        trace_id: null,
      },
    ]);
    assert.equal(response.metadata.steps[0]?.status, 'failed');
    assert.equal(response.metadata.steps[1]?.status, 'dlq');
  });

  it('returns a structured 404 when the generation does not exist for the user', async () => {
    const databaseService = {
      query: async () => ({ rows: [] }),
    } as unknown as DatabaseService;
    const pipelinePresetsRepository = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const service = new GenerationsService(
      databaseService,
      pipelinePresetsRepository,
      new ContractsService(),
    );

    await assert.rejects(
      () =>
        service.getGeneration(
          AUTHENTICATED_USER,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
      (error: unknown) => {
        assert.equal(
          (error as { getStatus?: () => number }).getStatus?.(),
          404,
        );
        return true;
      },
    );
  });
});
