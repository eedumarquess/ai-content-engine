import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { GenerationsController } from './generations.controller';

describe('GenerationsController', () => {
  it('marks POST /generate-content as 202 Accepted', async () => {
    const controller = new GenerationsController({
      createGeneration: async () => ({
        generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'queued',
        status_url: '/generations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
      getGeneration: async () => {
        throw new Error('not used');
      },
    } as never);

    const metadata = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      controller.generateContent,
    );

    assert.equal(metadata, HttpStatus.ACCEPTED);
    const response = await controller.generateContent(
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'local-admin@example.com',
      },
      {},
    );
    assert.equal(response.status, 'queued');
  });
});
