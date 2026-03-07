import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ContractsService } from '../contracts/contracts.service';
import type { PipelinePresetsRepository } from '../pipeline-presets/pipeline-presets.repository';
import type { StoredPipelinePreset } from '../pipeline-presets/pipeline-preset.types';
import type { GenerationDispatcher } from '../pipeline/generation-dispatcher.service';
import type { GenerationsRepository } from './generations.repository';
import { GenerateService } from './generate.service';

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

describe('GenerateService', () => {
  it('creates a queued generation and dispatches execution without waiting', async () => {
    const dispatched: string[] = [];
    const repository = {
      createGeneration: async () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    } as unknown as GenerationsRepository;
    const presets = {
      findActivePresetForUser: async () => PIPELINE_PRESET,
    } as unknown as PipelinePresetsRepository;
    const dispatcher = {
      dispatch: (generationId: string) => {
        dispatched.push(generationId);
      },
    } as unknown as GenerationDispatcher;
    const service = new GenerateService(
      new ContractsService(),
      presets,
      repository,
      dispatcher,
    );

    const response = await service.createGeneration(AUTHENTICATED_USER, {
      topic: 'RAG em producao',
      platform: 'linkedin',
      format: 'thread',
      pipeline_preset_id: PIPELINE_PRESET.id,
    });

    assert.equal(response.status, 'queued');
    assert.deepEqual(dispatched, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  });
});
