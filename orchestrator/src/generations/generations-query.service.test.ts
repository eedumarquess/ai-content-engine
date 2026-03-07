import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ContractsService } from '../contracts/contracts.service';
import type { GenerationsRepository } from './generations.repository';
import { GenerationsQueryService } from './generations-query.service';

const AUTHENTICATED_USER: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'local-admin@example.com',
};

describe('GenerationsQueryService', () => {
  it('returns a completed generation with validated result and step metadata', async () => {
    const repository = {
      findGenerationForUser: async () => ({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: AUTHENTICATED_USER.id,
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
        status: 'completed',
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
        steps: [
          {
            id: '1',
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            step_name: 'content',
            status: 'completed',
            attempt_count: 1,
            input_json: {},
            output_json: {},
            error_json: null,
            reply_metadata: {
              agent_name: 'content',
              model: 'qwen2.5:7b',
              prompt_version: 'v1',
              tokens_in: 111,
              tokens_out: 222,
              latency_ms: 333,
              cost_usd: 0,
              repair_attempts: 0,
              trace_id: 'trace-content',
            },
            started_at: null,
            finished_at: null,
          },
          {
            id: '2',
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            step_name: 'review',
            status: 'completed',
            attempt_count: 1,
            input_json: {},
            output_json: {},
            error_json: null,
            reply_metadata: {
              agent_name: 'review',
              model: 'qwen2.5:7b',
              prompt_version: 'v1',
              tokens_in: 120,
              tokens_out: 180,
              latency_ms: 444,
              cost_usd: 0,
              repair_attempts: 1,
              trace_id: 'trace-review',
            },
            started_at: null,
            finished_at: null,
          },
        ],
      }),
    } as unknown as GenerationsRepository;
    const service = new GenerationsQueryService(
      new ContractsService(),
      repository,
    );

    const response = await service.getGeneration(
      AUTHENTICATED_USER,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    assert.equal(response.status, 'completed');
    assert.equal(response.errors.length, 0);
    assert.equal(response.metadata.steps.length, 2);
    assert.equal(response.metadata.steps[0]?.status, 'completed');
    assert.equal(response.metadata.steps[0]?.latency_ms, 333);
    assert.equal(response.metadata.steps[1]?.repair_attempts, 1);
    assert.equal(response.metadata.metrics.total_tokens_in, 231);
    assert.equal(response.metadata.metrics.total_latency_ms, 777);
    assert.equal(response.result?.metadata.schema_version, 'v1');
  });

  it('returns a running generation with null result and empty errors', async () => {
    const repository = {
      findGenerationForUser: async () => ({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: AUTHENTICATED_USER.id,
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
        status: 'running',
        result_json: null,
        error_json: null,
        created_at: '2026-03-05T20:00:00.000Z',
        started_at: '2026-03-05T20:00:05.000Z',
        completed_at: null,
        steps: [
          {
            id: '1',
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            step_name: 'content',
            status: 'running',
            attempt_count: 1,
            input_json: {},
            output_json: null,
            error_json: null,
            reply_metadata: {
              agent_name: 'content',
              model: 'qwen2.5:7b',
              prompt_version: 'v1',
              tokens_in: 10,
              tokens_out: 20,
              latency_ms: 30,
              cost_usd: 0,
              repair_attempts: 0,
              trace_id: 'trace-running',
            },
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
        ],
      }),
    } as unknown as GenerationsRepository;
    const service = new GenerationsQueryService(
      new ContractsService(),
      repository,
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
    assert.equal(response.metadata.metrics.completed_steps, 0);
    assert.equal(response.metadata.metrics.failed_steps, 0);
  });

  it('falls back to an internal error when the stored failure payload is invalid', async () => {
    const repository = {
      findGenerationForUser: async () => ({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: AUTHENTICATED_USER.id,
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
        status: 'failed',
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
        steps: [
          {
            id: '1',
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            step_name: 'content',
            status: 'failed',
            attempt_count: 3,
            input_json: {},
            output_json: null,
            error_json: {},
            reply_metadata: {
              agent_name: 'content',
              model: 'qwen2.5:7b',
              prompt_version: 'v1',
              tokens_in: 50,
              tokens_out: 60,
              latency_ms: 70,
              cost_usd: 0,
              repair_attempts: 3,
              trace_id: 'trace-failed',
            },
            started_at: null,
            finished_at: null,
          },
          {
            id: '2',
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            step_name: 'review',
            status: 'dlq',
            attempt_count: 0,
            input_json: {},
            output_json: null,
            error_json: {},
            reply_metadata: {},
            started_at: null,
            finished_at: null,
          },
        ],
      }),
    } as unknown as GenerationsRepository;
    const service = new GenerationsQueryService(
      new ContractsService(),
      repository,
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
    assert.equal(response.metadata.metrics.failed_steps, 2);
  });
});
