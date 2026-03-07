import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GenerationsRepository } from '../generations/generations.repository';
import type { GenerationDispatcher } from './generation-dispatcher.service';
import { PipelineRecoveryService } from './pipeline-recovery.service';

describe('PipelineRecoveryService', () => {
  it('re-dispatches pending generations on startup', async () => {
    const dispatched: string[] = [];
    const service = new PipelineRecoveryService(
      {
        findPendingGenerationIds: async () => [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ],
      } as unknown as GenerationsRepository,
      {
        dispatch: (generationId: string) => {
          dispatched.push(generationId);
        },
      } as unknown as GenerationDispatcher,
    );

    await service.onApplicationBootstrap();

    assert.deepEqual(dispatched, [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });
});
