import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { PerformanceEventsController } from './performance-events.controller';

describe('PerformanceEventsController', () => {
  it('marks POST /performance-events as 201 Created', async () => {
    const controller = new PerformanceEventsController({
      createEvent: async () => ({
        event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'stored',
      }),
    } as never);

    const metadata = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      controller.createEvent,
    );

    assert.equal(metadata, HttpStatus.CREATED);
    const response = await controller.createEvent(
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'local-admin@example.com',
      },
      {},
    );
    assert.equal(response.status, 'stored');
    assert.equal(response.event_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
