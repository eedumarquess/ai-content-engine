import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GenerationsController } from './generations.controller';

describe('GenerationsController', () => {
  it('delegates GET /generations/:id to the query service', async () => {
    const controller = new GenerationsController({
      getGeneration: async () => ({
        generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'running',
        result: null,
        errors: [],
        metadata: {
          pipeline_preset_id: 'c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1',
          schema_version: 'v1',
          created_at: '2026-03-05T20:00:00.000Z',
          started_at: '2026-03-05T20:00:05.000Z',
          completed_at: null,
          steps: [],
        },
      }),
    } as never);

    const response = await controller.getGeneration(
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'local-admin@example.com',
      },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    assert.equal(response.status, 'running');
    assert.equal(response.result, null);
  });
});
